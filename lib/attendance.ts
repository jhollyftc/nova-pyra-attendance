import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

export type CheckoutResult =
  | { ok: true; name: string; totalMinutes: number; adjusted: boolean }
  | { ok: false; message: string; status: number };

type Record = {
  attendance_id: string;
  check_in_time: string;
  status: string;
  name: string;
};

/** How far past "now" a submitted check-out time may sit before it is rejected. */
const FUTURE_TOLERANCE_MS = 2 * 60_000;

/**
 * Closes someone else's open attendance record.
 *
 * Shared by the kiosk panel (gated on the admin password, since the kiosk is
 * unauthenticated) and the admin dashboard (gated on the session cookie).
 * Callers authenticate first — this function does not.
 *
 * @param at Explicit check-out time. Admins can back-date this, since a record
 *   left open usually means the member forgot to tap out and left earlier. A
 *   time more than a couple of minutes off "now" is treated as a correction:
 *   the record is flagged `manual_fixed` so the estimate stays visible later
 *   rather than passing as a normal check-out. Defaults to now.
 */
export function checkOutRecord(
  attendanceId: string,
  actor: "kiosk" | "admin",
  at?: Date
): CheckoutResult {
  const db = getDb();

  const record = db
    .prepare(
      `SELECT ar.attendance_id, ar.check_in_time, ar.status,
              COALESCE(s.display_name, s.first_name) AS name
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.attendance_id = ?`
    )
    .get(attendanceId) as Record | undefined;

  if (!record) return { ok: false, message: "Record not found.", status: 404 };
  if (record.status !== "checked_in") {
    return { ok: false, message: "Not currently checked in.", status: 409 };
  }

  const now = new Date();
  const checkOutTime = at ?? now;
  const checkIn = new Date(record.check_in_time);

  if (Number.isNaN(checkOutTime.getTime())) {
    return { ok: false, message: "Invalid check-out time.", status: 400 };
  }
  if (checkOutTime.getTime() <= checkIn.getTime()) {
    return { ok: false, message: "Check-out must be after check-in.", status: 400 };
  }
  if (checkOutTime.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    return { ok: false, message: "Check-out time cannot be in the future.", status: 400 };
  }

  const totalMinutes = Math.round(
    (checkOutTime.getTime() - checkIn.getTime()) / 60000
  );
  const adjusted =
    at !== undefined &&
    Math.abs(checkOutTime.getTime() - now.getTime()) > FUTURE_TOLERANCE_MS;

  db.transaction(() => {
    db.prepare(
      `UPDATE attendance_records
       SET check_out_time = ?, total_minutes = ?, status = ?,
           edit_reason = COALESCE(?, edit_reason), updated_at = datetime('now')
       WHERE attendance_id = ?`
    ).run(
      checkOutTime.toISOString(),
      totalMinutes,
      adjusted ? "manual_fixed" : "checked_out",
      adjusted ? "Check-out time set by an admin — member did not check out." : null,
      record.attendance_id
    );

    db.prepare(
      `INSERT INTO audit_logs (id, action, table_name, record_id, new_values)
       VALUES (?, ?, 'attendance_records', ?, ?)`
    ).run(
      randomUUID(),
      `${actor}_checkout`,
      record.attendance_id,
      JSON.stringify({
        check_out_time: checkOutTime.toISOString(),
        total_minutes: totalMinutes,
        adjusted,
      })
    );
  })();

  return { ok: true, name: record.name, totalMinutes, adjusted };
}
