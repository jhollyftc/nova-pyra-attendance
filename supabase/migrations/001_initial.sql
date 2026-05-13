-- ============================================================
-- Nova Pyra Attendance App — Initial Schema
-- Run this in the Supabase SQL editor
-- ============================================================

-- ── ENUMS ────────────────────────────────────────────────────

CREATE TYPE session_type AS ENUM (
  'Regular Build',
  'Extended Build',
  'Driver Practice',
  'CAD Meeting',
  'Programming Meeting',
  'Outreach Event',
  'Competition',
  'Fundraiser'
);

CREATE TYPE session_status AS ENUM ('scheduled', 'active', 'ended', 'cancelled');

CREATE TYPE attendance_status AS ENUM (
  'checked_in',
  'checked_out',
  'missing_checkout',
  'manual_fixed',
  'voided'
);

-- ── TABLES ───────────────────────────────────────────────────

CREATE TABLE students (
  student_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  display_name  TEXT,
  grade         TEXT,
  subteam       TEXT,
  role          TEXT,
  pin_hash      TEXT NOT NULL,
  active_status BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  session_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_name          TEXT NOT NULL,
  session_type          session_type NOT NULL DEFAULT 'Regular Build',
  location              TEXT,
  session_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  scheduled_start_time  TIMESTAMPTZ,
  scheduled_end_time    TIMESTAMPTZ,
  actual_start_time     TIMESTAMPTZ,
  actual_end_time       TIMESTAMPTZ,
  status                session_status NOT NULL DEFAULT 'scheduled',
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attendance_records (
  attendance_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  session_id     UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  check_in_time  TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out_time TIMESTAMPTZ,
  total_minutes  INTEGER,
  status         attendance_status NOT NULL DEFAULT 'checked_in',
  edited_by      UUID REFERENCES auth.users(id),
  edit_reason    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT NOT NULL,
  table_name   TEXT,
  record_id    UUID,
  old_values   JSONB,
  new_values   JSONB,
  performed_by UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────

CREATE INDEX idx_students_active ON students(active_status);
CREATE INDEX idx_sessions_status ON sessions(status);
CREATE INDEX idx_attendance_session ON attendance_records(session_id);
CREATE INDEX idx_attendance_student ON attendance_records(student_id);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_attendance_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- students: only authenticated admins
CREATE POLICY "admins_all_students" ON students
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- sessions: anon can read active sessions (kiosk display)
CREATE POLICY "anon_read_active_sessions" ON sessions
  FOR SELECT TO anon USING (status = 'active');

CREATE POLICY "admins_all_sessions" ON sessions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- attendance_records: only authenticated admins
CREATE POLICY "admins_all_attendance" ON attendance_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- audit_logs: only authenticated admins
CREATE POLICY "admins_all_audit_logs" ON audit_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
