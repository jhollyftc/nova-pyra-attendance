import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "nova-pyra.db");

const g = global as typeof globalThis & { _db?: Database.Database };

export function getDb(): Database.Database {
  if (!g._db) {
    g._db = new Database(DB_PATH);
    g._db.pragma("journal_mode = WAL");
    g._db.pragma("foreign_keys = ON");
    initSchema(g._db);
  }
  return g._db;
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
  `);
}
