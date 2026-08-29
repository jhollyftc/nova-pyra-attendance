import { getDb, stmt } from "@/lib/db";
import { buildDate, buildDayEnd } from "@/lib/buildDay";
import { randomUUID } from "crypto";

export { DAY_BOUNDARY_HOUR, buildDate, buildDayEnd, sessionNameFor } from "@/lib/buildDay";

type StaleSession = { session_id: string; session_date: string };
type OpenRecord = { attendance_id: string; check_in_time: string };

/**
 * Ends any active session left over from a previous build day, closing it at
 * that day's boundary rather than "now" so an unattended kiosk can't accrue
 * hours overnight.
 *
 * Anyone still checked in is closed out as `missing_checkout` — a visible flag
 * for an admin — but with `total_minutes` computed, so confirming the record
 * restores the hours instead of requiring the times be re-entered by hand.
 *
 * Called lazily from the routes that read session state rather than from a
 * timer: the kiosk PC sleeps and reboots, but a `setTimeout` scheduled for
 * 4 AM does not survive either. Running on request means the rollover
 * self-heals however long the machine was off.
 *
 * @returns the number of sessions ended.
 */
export function rolloverStaleSessions(now = new Date()): number {
  const today = buildDate(now);

  const stale = stmt(
    `SELECT session_id, session_date FROM sessions
     WHERE status = 'active' AND session_date < ?`
  ).all(today) as StaleSession[];

  if (stale.length === 0) return 0;

  const db = getDb();
  const closeOne = db.transaction((session: StaleSession) => {
    const boundary = buildDayEnd(session.session_date).getTime();

    const open = stmt(
      `SELECT attendance_id, check_in_time FROM attendance_records
       WHERE session_id = ? AND status = 'checked_in'`
    ).all(session.session_id) as OpenRecord[];

    for (const rec of open) {
      const checkIn = new Date(rec.check_in_time).getTime();
      // Guards against a check-in recorded after the boundary, which would
      // otherwise yield negative minutes.
      const closedAt = Math.max(boundary, checkIn);

      stmt(
        `UPDATE attendance_records
         SET check_out_time = ?, total_minutes = ?, status = 'missing_checkout',
             edit_reason = ?, updated_at = datetime('now')
         WHERE attendance_id = ?`
      ).run(
        new Date(closedAt).toISOString(),
        Math.round((closedAt - checkIn) / 60000),
        `Auto-closed at end of build day (${session.session_date}) — no checkout recorded.`,
        rec.attendance_id
      );
    }

    stmt(
      `UPDATE sessions
       SET status = 'ended', actual_end_time = ?, updated_at = datetime('now')
       WHERE session_id = ?`
    ).run(new Date(boundary).toISOString(), session.session_id);

    stmt(
      `INSERT INTO audit_logs (id, action, table_name, record_id, new_values)
       VALUES (?, 'auto_end_session', 'sessions', ?, ?)`
    ).run(
      randomUUID(),
      session.session_id,
      JSON.stringify({ ended_at: new Date(boundary).toISOString(), auto_closed: open.length })
    );
  });

  for (const session of stale) closeOne(session);
  return stale.length;
}
