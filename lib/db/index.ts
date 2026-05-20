import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "nova-pyra.db");

const g = global as typeof globalThis & {
  _db?: Database.Database;
  _stmtCache?: Map<string, Database.Statement>;
};

export function getDb(): Database.Database {
  if (!g._db) {
    const db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
    migrate(db);
    g._db = db; // only cached after successful init
  }
  return g._db;
}

// Lazily prepares and caches statements for the lifetime of the server process.
export function stmt(sql: string): Database.Statement {
  const db = getDb();
  if (!g._stmtCache) g._stmtCache = new Map();
  let s = g._stmtCache.get(sql);
  if (!s) {
    s = db.prepare(sql);
    g._stmtCache.set(sql, s);
  }
  return s;
}

// Replaces the bcrypt-loop pattern in kiosk routes.
// Queries by the plaintext `pin` column (already stored for export)
// with an index, making PIN lookup O(log n) instead of O(n × bcrypt_time).
export function findStudentByPin(
  pin: string
): { student_id: string; display_name: string | null; first_name: string } | undefined {
  return stmt(
    `SELECT student_id, display_name, first_name
     FROM students WHERE pin = ? AND active_status = 1 LIMIT 1`
  ).get(pin) as
    | { student_id: string; display_name: string | null; first_name: string }
    | undefined;
}

function migrate(db: Database.Database) {
  const cols = db.prepare("PRAGMA table_info(students)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "pin")) {
    db.exec("ALTER TABLE students ADD COLUMN pin TEXT");
  }
  // Created here (not in initSchema) so it always runs after pin is guaranteed to exist.
  db.exec("CREATE INDEX IF NOT EXISTS idx_students_active_pin ON students(active_status, pin)");
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      student_id    TEXT PRIMARY KEY,
      first_name    TEXT NOT NULL,
      last_name     TEXT NOT NULL,
      display_name  TEXT,
      grade         TEXT,
      subteam       TEXT,
      role          TEXT,
      pin_hash      TEXT NOT NULL,
      pin           TEXT,
      active_status INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id           TEXT PRIMARY KEY,
      session_name         TEXT NOT NULL,
      session_type         TEXT NOT NULL DEFAULT 'Regular Build',
      location             TEXT,
      session_date         TEXT NOT NULL,
      scheduled_start_time TEXT,
      scheduled_end_time   TEXT,
      actual_start_time    TEXT,
      actual_end_time      TEXT,
      status               TEXT NOT NULL DEFAULT 'scheduled',
      notes                TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      attendance_id  TEXT PRIMARY KEY,
      student_id     TEXT NOT NULL REFERENCES students(student_id),
      session_id     TEXT NOT NULL REFERENCES sessions(session_id),
      check_in_time  TEXT NOT NULL,
      check_out_time TEXT,
      total_minutes  INTEGER,
      status         TEXT NOT NULL DEFAULT 'checked_in',
      edit_reason    TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id          TEXT PRIMARY KEY,
      action      TEXT NOT NULL,
      table_name  TEXT,
      record_id   TEXT,
      old_values  TEXT,
      new_values  TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_att_student_status_time ON attendance_records(student_id, status, check_in_time DESC);
    CREATE INDEX IF NOT EXISTS idx_att_status_time         ON attendance_records(status, check_in_time DESC);
    CREATE INDEX IF NOT EXISTS idx_att_session_status      ON attendance_records(session_id, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_status         ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_date           ON sessions(session_date DESC);
    CREATE INDEX IF NOT EXISTS idx_students_active         ON students(active_status);
    CREATE INDEX IF NOT EXISTS idx_students_role           ON students(role, student_id);
  `);
}
