import { getDb, stmt } from "@/lib/db";
import { getCurrentSeason, getAllSeasons, type SeasonInfo } from "@/lib/seasons";

/**
 * One-way push of a season of attendance to the cloud mirror.
 *
 * The kiosk is the source of truth; the cloud copy is read-only. Nothing is
 * ever pulled back, so there is no conflict resolution to get wrong.
 *
 * A whole season is only a few hundred KB, so each push is a full snapshot
 * rather than an incremental diff: edits, voids and deletes all propagate for
 * free, and a botched push is repaired by the next one.
 */

export const SCHEMA_VERSION = 1;

/** Fields the cloud is allowed to receive. Anything not listed never leaves the kiosk. */
type CloudMember = {
  student_id: string;
  label: string;
  grade: string | null;
  subteam: string | null;
  role: string | null;
  active: boolean;
};

type CloudSession = {
  session_id: string;
  session_name: string;
  session_type: string;
  location: string | null;
  session_date: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: string;
};

type CloudRecord = {
  attendance_id: string;
  student_id: string;
  session_id: string;
  check_in_time: string;
  check_out_time: string | null;
  total_minutes: number | null;
  status: string;
};

export type Snapshot = {
  schema_version: number;
  pushed_at: string;
  season: { name: string; start: string; end: string };
  members: CloudMember[];
  sessions: CloudSession[];
  records: CloudRecord[];
};

export type SyncState = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_record_count: number | null;
};

/**
 * "Evelyn Holly" becomes "Evelyn H." — the form already published on the team
 * site, so the cloud never holds a full surname to truncate.
 */
function cloudLabel(row: {
  first_name: string;
  last_name: string | null;
  display_name: string | null;
}): string {
  const given = (row.display_name ?? row.first_name ?? "").trim();
  const initial = (row.last_name ?? "").trim().charAt(0);
  return initial ? given + " " + initial.toUpperCase() + "." : given;
}

export function resolveSeason(seasonName?: string): SeasonInfo {
  if (!seasonName) return getCurrentSeason();
  const found = getAllSeasons().find((s) => s.name === seasonName);
  if (!found) throw new Error("Unknown season: " + seasonName);
  return found;
}

/**
 * Builds the payload for one season.
 *
 * Every column is listed explicitly. `pin` and `pin_hash` must never appear —
 * a leaked PIN lets anyone check members in and out. Free-text fields
 * (`notes`, `edit_reason`) are also withheld: they are admin-written prose and
 * can name the people the pseudonymous label is meant to protect.
 */
export function buildSnapshot(seasonName?: string): Snapshot {
  getDb();
  const season = resolveSeason(seasonName);
  const from = season.start.toISOString();
  const to = season.end.toISOString();

  const records = stmt(
    `SELECT attendance_id, student_id, session_id, check_in_time,
            check_out_time, total_minutes, status
     FROM attendance_records
     WHERE check_in_time >= ? AND check_in_time <= ?
     ORDER BY check_in_time`
  ).all(from, to) as CloudRecord[];

  const sessions = stmt(
    `SELECT session_id, session_name, session_type, location, session_date,
            actual_start_time, actual_end_time, status
     FROM sessions
     WHERE session_date >= ? AND session_date <= ?
     ORDER BY session_date`
  ).all(from.split("T")[0], to.split("T")[0]) as CloudSession[];

  const memberRows = stmt(
    `SELECT student_id, first_name, last_name, display_name, grade, subteam,
            role, active_status
     FROM students`
  ).all() as {
    student_id: string;
    first_name: string;
    last_name: string | null;
    display_name: string | null;
    grade: string | null;
    subteam: string | null;
    role: string | null;
    active_status: number;
  }[];

  // Only members who appear in this season, so the cloud never holds a roster
  // entry it has no reason to.
  const seen = new Set(records.map((r) => r.student_id));
  const members: CloudMember[] = memberRows
    .filter((m) => seen.has(m.student_id))
    .map((m) => ({
      student_id: m.student_id,
      label: cloudLabel(m),
      grade: m.grade,
      subteam: m.subteam,
      role: m.role,
      active: m.active_status === 1,
    }));

  return {
    schema_version: SCHEMA_VERSION,
    pushed_at: new Date().toISOString(),
    season: { name: season.name, start: from, end: to },
    members,
    sessions,
    records,
  };
}

export function getSyncState(): SyncState {
  getDb();
  const row = stmt(
    `SELECT last_attempt_at, last_success_at, last_error, last_record_count
     FROM sync_state WHERE id = 1`
  ).get() as SyncState | undefined;

  return (
    row ?? {
      last_attempt_at: null,
      last_success_at: null,
      last_error: null,
      last_record_count: null,
    }
  );
}

function recordAttempt(error: string | null, count: number | null) {
  const now = new Date().toISOString();
  stmt(
    `INSERT INTO sync_state (id, last_attempt_at, last_success_at, last_error, last_record_count)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       last_attempt_at   = excluded.last_attempt_at,
       last_success_at   = COALESCE(excluded.last_success_at, sync_state.last_success_at),
       last_error        = excluded.last_error,
       last_record_count = COALESCE(excluded.last_record_count, sync_state.last_record_count)`
  ).run(now, error ? null : now, error, count);
}

export type PushFailureKind = "config" | "input" | "network" | "remote";

export type PushResult =
  | { ok: true; recordCount: number; season: string }
  | { ok: false; error: string; kind: PushFailureKind };

/** Milliseconds before a push is abandoned. The kiosk must never wait on the network. */
const PUSH_TIMEOUT_MS = 20_000;

export async function pushSnapshot(seasonName?: string): Promise<PushResult> {
  const url = process.env.SYNC_URL;
  const token = process.env.SYNC_TOKEN;

  if (!url || !token) {
    return {
      ok: false,
      kind: "config",
      error: "Cloud sync is not configured (set SYNC_URL and SYNC_TOKEN).",
    };
  }

  let snapshot: Snapshot;
  try {
    snapshot = buildSnapshot(seasonName);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    recordAttempt(error, null);
    return { ok: false, error, kind: "input" };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = "Cloud returned " + res.status + (body ? ": " + body.slice(0, 200) : "");
      recordAttempt(error, null);
      return { ok: false, error, kind: "remote" };
    }

    recordAttempt(null, snapshot.records.length);
    return { ok: true, recordCount: snapshot.records.length, season: snapshot.season.name };
  } catch (e) {
    // Being offline is the normal case here, not an exceptional one, so the
    // message says so plainly instead of surfacing fetch's opaque wording.
    const error =
      e instanceof Error && e.name === "TimeoutError"
        ? "Timed out reaching the cloud."
        : "Could not reach the cloud — no network?";
    recordAttempt(error, null);
    return { ok: false, error, kind: "network" };
  }
}

/** Minimum gap between automatic pushes. A manual push ignores this. */
const AUTO_PUSH_INTERVAL_MS = 20 * 60 * 60 * 1000;

let autoPushInFlight = false;

/**
 * Fire-and-forget daily push.
 *
 * Triggered from the same lazily-called path as the day rollover rather than a
 * timer, for the same reason: the kiosk sleeps and reboots, and a setInterval
 * scheduled for tomorrow does not survive either. Callers must not await this —
 * nobody tapping a PIN should ever wait on the network.
 */
export function maybeAutoPush(now = new Date()): void {
  if (autoPushInFlight) return;
  if (!process.env.SYNC_URL || !process.env.SYNC_TOKEN) return;

  const state = getSyncState();
  const last = state.last_attempt_at ? new Date(state.last_attempt_at).getTime() : 0;
  if (now.getTime() - last < AUTO_PUSH_INTERVAL_MS) return;

  autoPushInFlight = true;
  void pushSnapshot()
    .catch(() => {
      // recordAttempt already stored the failure.
    })
    .finally(() => {
      autoPushInFlight = false;
    });
}
