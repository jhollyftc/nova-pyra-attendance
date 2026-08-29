/**
 * Shape of a kiosk push, and its runtime validation.
 *
 * This endpoint is public, so nothing here trusts the body: every row is
 * checked before it reaches SQL. A malformed push is rejected whole rather
 * than partially applied.
 */

export const SUPPORTED_SCHEMA_VERSION = 1;

export type Member = {
  student_id: string;
  label: string;
  grade: string | null;
  subteam: string | null;
  role: string | null;
  active: boolean;
};

export type Session = {
  session_id: string;
  session_name: string;
  session_type: string;
  location: string | null;
  session_date: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: string;
};

export type Record = {
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
  members: Member[];
  sessions: Session[];
  records: Record[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObj(v: unknown): v is globalThis.Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown) => typeof v === "string";
const nullStr = (v: unknown) => v === null || typeof v === "string";
const iso = (v: unknown) => typeof v === "string" && !Number.isNaN(Date.parse(v));
const nullIso = (v: unknown) => v === null || iso(v);
const uuid = (v: unknown) => typeof v === "string" && UUID.test(v);

/** Caps a single push. The real payload is a few hundred KB; this is a sanity bound. */
const MAX_ROWS = 100_000;

export function validate(body: unknown): { ok: true; snapshot: Snapshot } | { ok: false; error: string } {
  if (!isObj(body)) return { ok: false, error: "Body must be an object." };

  if (body.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Unsupported schema_version ${String(body.schema_version)}; this server speaks ${SUPPORTED_SCHEMA_VERSION}.`,
    };
  }
  if (!iso(body.pushed_at)) return { ok: false, error: "pushed_at must be an ISO timestamp." };

  const season = body.season;
  if (!isObj(season) || !str(season.name) || !iso(season.start) || !iso(season.end)) {
    return { ok: false, error: "season must have name, start and end." };
  }
  if (Date.parse(season.start as string) >= Date.parse(season.end as string)) {
    return { ok: false, error: "season.start must precede season.end." };
  }

  for (const key of ["members", "sessions", "records"] as const) {
    if (!Array.isArray(body[key])) return { ok: false, error: `${key} must be an array.` };
    if ((body[key] as unknown[]).length > MAX_ROWS) {
      return { ok: false, error: `${key} exceeds ${MAX_ROWS} rows.` };
    }
  }

  const members = body.members as unknown[];
  for (const [i, m] of members.entries()) {
    if (!isObj(m) || !uuid(m.student_id) || !str(m.label) ||
        !nullStr(m.grade) || !nullStr(m.subteam) || !nullStr(m.role) ||
        typeof m.active !== "boolean") {
      return { ok: false, error: `members[${i}] is malformed.` };
    }
  }

  const sessions = body.sessions as unknown[];
  for (const [i, s] of sessions.entries()) {
    if (!isObj(s) || !uuid(s.session_id) || !str(s.session_name) || !str(s.session_type) ||
        !nullStr(s.location) || !str(s.session_date) || !DATE.test(s.session_date as string) ||
        !nullIso(s.actual_start_time) || !nullIso(s.actual_end_time) || !str(s.status)) {
      return { ok: false, error: `sessions[${i}] is malformed.` };
    }
  }

  const records = body.records as unknown[];
  const memberIds = new Set(members.map((m) => (m as Member).student_id));
  const sessionIds = new Set(sessions.map((s) => (s as Session).session_id));

  for (const [i, r] of records.entries()) {
    if (!isObj(r) || !uuid(r.attendance_id) || !uuid(r.student_id) || !uuid(r.session_id) ||
        !iso(r.check_in_time) || !nullIso(r.check_out_time) || !str(r.status) ||
        !(r.total_minutes === null || (typeof r.total_minutes === "number" && Number.isFinite(r.total_minutes)))) {
      return { ok: false, error: `records[${i}] is malformed.` };
    }
    // Foreign keys would catch these, but the error is far clearer here.
    if (!memberIds.has(r.student_id as string)) {
      return { ok: false, error: `records[${i}] references a member missing from the payload.` };
    }
    if (!sessionIds.has(r.session_id as string)) {
      return { ok: false, error: `records[${i}] references a session missing from the payload.` };
    }
  }

  return { ok: true, snapshot: body as unknown as Snapshot };
}
