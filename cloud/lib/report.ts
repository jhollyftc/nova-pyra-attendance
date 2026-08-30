import { db } from "@/lib/db";

export type MemberTotal = {
  student_id: string;
  label: string;
  grade: string | null;
  subteam: string | null;
  role: string | null;
  sessions: number;
  minutes: number;
};

export type Season = { name: string; season_start: string; season_end: string };

/**
 * Hours are counted exactly as the kiosk counts them: settled records only.
 * `missing_checkout` stays out until an admin confirms it, so a total here can
 * never disagree with the same total on the kiosk.
 */
const COUNTED = ["checked_out", "manual_fixed"];

export async function seasons(): Promise<Season[]> {
  const sql = db();
  return sql<Season[]>`
    SELECT name, season_start::text, season_end::text
    FROM mirror.seasons
    ORDER BY season_start DESC
  `;
}

/** Totals for one season, or for the most recent one when none is named. */
export async function memberTotals(seasonName?: string): Promise<MemberTotal[]> {
  const sql = db();
  const [season] = seasonName
    ? await sql<Season[]>`
        SELECT name, season_start::text, season_end::text
        FROM mirror.seasons WHERE name = ${seasonName}
      `
    : await sql<Season[]>`
        SELECT name, season_start::text, season_end::text
        FROM mirror.seasons ORDER BY season_start DESC LIMIT 1
      `;

  if (!season) return [];

  return sql<MemberTotal[]>`
    SELECT m.student_id, m.label, m.grade, m.subteam, m.role,
           COUNT(DISTINCT ar.session_id)::int AS sessions,
           COALESCE(SUM(ar.total_minutes), 0)::int AS minutes
    FROM mirror.members m
    JOIN mirror.attendance_records ar ON ar.student_id = m.student_id
    WHERE ar.status = ANY(${COUNTED})
      AND ar.check_in_time >= ${season.season_start}
      AND ar.check_in_time <= ${season.season_end}
    GROUP BY m.student_id, m.label, m.grade, m.subteam, m.role
    HAVING COALESCE(SUM(ar.total_minutes), 0) > 0
    ORDER BY minutes DESC, m.label ASC
  `;
}

export type SyncInfo = { received_at: string; season: string; record_count: number };

export async function lastSync(): Promise<SyncInfo | null> {
  const sql = db();
  const rows = await sql<SyncInfo[]>`
    SELECT received_at::text, season, record_count
    FROM mirror.sync_log ORDER BY received_at DESC LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * Last push for one specific season.
 *
 * The global "last sync" is misleading on an older season's page: it reports
 * when the *current* season was pushed, making stale data look fresh.
 */
export async function lastSyncFor(seasonName: string): Promise<SyncInfo | null> {
  const sql = db();
  const rows = await sql<SyncInfo[]>`
    SELECT received_at::text, season, record_count
    FROM mirror.sync_log WHERE season = ${seasonName}
    ORDER BY received_at DESC LIMIT 1
  `;
  return rows[0] ?? null;
}
