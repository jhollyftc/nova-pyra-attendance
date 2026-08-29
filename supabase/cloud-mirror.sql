-- ============================================================
-- Nova Pyra Attendance — CLOUD MIRROR schema (Postgres)
--
-- Read-only mirror of the kiosk's SQLite database, fed by
-- POST /api/sync from the kiosk. The kiosk is the source of truth:
-- nothing here is ever edited by hand or pushed back.
--
-- Supersedes 001_initial.sql for this purpose. That file described a
-- full Supabase-hosted app holding real names and auth.users; this one
-- deliberately holds neither.
--
-- Privacy: members are identified by the kiosk's random UUID and a
-- "Evelyn H." style label — the form already published on the team
-- website. No surnames, no PINs, no free-text notes.
--
-- Everything lives in a dedicated "mirror" schema. The abandoned
-- 001_initial.sql design also declared public.sessions and
-- public.attendance_records; with unqualified CREATE TABLE IF NOT
-- EXISTS, this file would have silently no-opped against a project
-- that still has them and left the wrong column shape in place.
-- The schema also makes teardown one line:  DROP SCHEMA mirror CASCADE;
-- ============================================================

CREATE SCHEMA IF NOT EXISTS mirror;

-- Season windows, as pushed by the kiosk. Stored rather than recomputed so
-- the cloud never has to duplicate the kiosk's season arithmetic (competition
-- Aug-May, summer Jun-Jul) and drift from it.
CREATE TABLE IF NOT EXISTS mirror.seasons (
  name         TEXT PRIMARY KEY,
  season_start TIMESTAMPTZ NOT NULL,
  season_end   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS mirror.members (
  student_id  UUID PRIMARY KEY,
  label       TEXT NOT NULL,
  grade       TEXT,
  subteam     TEXT,
  role        TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mirror.sessions (
  session_id         UUID PRIMARY KEY,
  session_name       TEXT NOT NULL,
  session_type       TEXT NOT NULL,
  location           TEXT,
  session_date       DATE NOT NULL,
  actual_start_time  TIMESTAMPTZ,
  actual_end_time    TIMESTAMPTZ,
  status             TEXT NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mirror.attendance_records (
  attendance_id   UUID PRIMARY KEY,
  student_id      UUID NOT NULL REFERENCES mirror.members(student_id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES mirror.sessions(session_id) ON DELETE CASCADE,
  check_in_time   TIMESTAMPTZ NOT NULL,
  check_out_time  TIMESTAMPTZ,
  total_minutes   INTEGER,
  status          TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reporting reads: hours per member, and per-session rosters.
CREATE INDEX IF NOT EXISTS idx_cloud_att_student ON mirror.attendance_records(student_id, check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_att_session ON mirror.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_cloud_att_status  ON mirror.attendance_records(status);
CREATE INDEX IF NOT EXISTS idx_cloud_sess_date   ON mirror.sessions(session_date DESC);

-- One row per push, so the remote app can show how fresh the data is
-- and you can spot a kiosk that quietly stopped syncing.
CREATE TABLE IF NOT EXISTS mirror.sync_log (
  id             BIGSERIAL PRIMARY KEY,
  season         TEXT NOT NULL,
  pushed_at      TIMESTAMPTZ NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_count   INTEGER NOT NULL,
  member_count   INTEGER NOT NULL,
  session_count  INTEGER NOT NULL,
  schema_version INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_log_received ON mirror.sync_log(received_at DESC);

-- ── Notes for the receiving endpoint ────────────────────────
--
-- A push is a FULL SNAPSHOT of one season, so the receiver should, in a
-- single transaction:
--   1. upsert every member / session / record in the payload
--      (INSERT ... ON CONFLICT (pk) DO UPDATE SET ...)
--   2. delete rows for that season that the payload no longer contains,
--      which is how a voided-then-deleted record disappears
--   3. insert one sync_log row
--
-- Step 2 must be scoped to the pushed season's date range, or a push of
-- the current season would wipe previous seasons.
