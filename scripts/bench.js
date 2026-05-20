#!/usr/bin/env node
// Nova Pyra Attendance — Performance Benchmark
// Simulates both OLD (current) and NEW (optimized) database access patterns
// on identical in-memory test data so comparisons are perfectly controlled.
// Run: node scripts/bench.js

const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const STUDENTS = 60;
const SESSIONS = 30;
const RECORDS = 8000;

// ─── Seed ────────────────────────────────────────────────────────────────────

function buildDb(withIndexes) {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE students (
      student_id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
      display_name TEXT, grade TEXT, subteam TEXT, role TEXT,
      pin_hash TEXT NOT NULL, pin TEXT,
      active_status INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sessions (
      session_id TEXT PRIMARY KEY, session_name TEXT NOT NULL,
      session_type TEXT NOT NULL DEFAULT 'Regular Build', location TEXT,
      session_date TEXT NOT NULL, actual_start_time TEXT, actual_end_time TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE attendance_records (
      attendance_id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(student_id),
      session_id TEXT NOT NULL REFERENCES sessions(session_id),
      check_in_time TEXT NOT NULL, check_out_time TEXT, total_minutes INTEGER,
      status TEXT NOT NULL DEFAULT 'checked_in',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (withIndexes) {
    db.exec(`
      CREATE INDEX idx_att_student_status_time ON attendance_records(student_id, status, check_in_time DESC);
      CREATE INDEX idx_att_status_time         ON attendance_records(status, check_in_time DESC);
      CREATE INDEX idx_att_session_status      ON attendance_records(session_id, status);
      CREATE INDEX idx_sessions_status         ON sessions(status);
      CREATE INDEX idx_sessions_date           ON sessions(session_date DESC);
      CREATE INDEX idx_students_active_pin     ON students(active_status, pin);
      CREATE INDEX idx_students_active         ON students(active_status);
      CREATE INDEX idx_students_role           ON students(role, student_id);
    `);
  }

  // Pre-compute hashes (slow — do outside transaction)
  const hashes = [];
  for (let i = 0; i < STUDENTS; i++) {
    // Reuse one hash so seeding finishes in seconds.
    // The LAST student gets a distinct hash — that's our lookup target (worst case).
    hashes.push(i === STUDENTS - 1 ? bcrypt.hashSync("9999", 10) : bcrypt.hashSync("1234", 10));
  }

  db.transaction(() => {
    const insS = db.prepare(
      `INSERT INTO students (student_id, first_name, last_name, pin_hash, pin, role, active_status, subteam)
       VALUES (?, ?, ?, ?, ?, 'Student', 1, ?)`
    );
    const subteams = ["Build", "Design", "Code", "Marketing"];
    for (let i = 0; i < STUDENTS; i++) {
      const pin = i === STUDENTS - 1 ? "9999" : String(1000 + i).padStart(4, "0");
      insS.run(`s${i}`, `First${i}`, `Last${i}`, hashes[i], pin, subteams[i % subteams.length]);
    }

    const insSess = db.prepare(
      `INSERT INTO sessions (session_id, session_name, session_type, session_date, actual_start_time, actual_end_time, status)
       VALUES (?, ?, 'Regular Build', ?, ?, ?, ?)`
    );
    for (let i = 0; i < SESSIONS - 1; i++) {
      const d = `2025-${String(Math.floor(i / 4) + 1).padStart(2, "0")}-${String((i % 4) * 7 + 1).padStart(2, "0")}`;
      insSess.run(`sess${i}`, `Session ${i}`, d, `${d}T17:00:00Z`, `${d}T20:00:00Z`, "ended");
    }
    insSess.run("sess-active", "Today", "2026-05-19", "2026-05-19T17:00:00Z", null, "active");

    const insR = db.prepare(
      `INSERT INTO attendance_records (attendance_id, student_id, session_id, check_in_time, check_out_time, total_minutes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (let i = 0; i < RECORDS; i++) {
      const sid = `s${i % STUDENTS}`;
      const sessId = `sess${i % (SESSIONS - 1)}`;
      const d = `2025-${String(Math.floor((i % 200) / 4) % 12 + 1).padStart(2, "0")}-${String(((i % 4) * 7 + 1)).padStart(2, "0")}`;
      insR.run(`att${i}`, sid, sessId, `${d}T17:00:00Z`, `${d}T20:00:00Z`, 120, "checked_out");
    }
    // A few active check-ins
    for (let i = 0; i < 8; i++) {
      insR.run(`att-live${i}`, `s${i}`, "sess-active", "2026-05-19T17:00:00Z", null, null, "checked_in");
    }
  })();

  return db;
}

// ─── Timing helpers ───────────────────────────────────────────────────────────

function bench(label, fn, runs = 200) {
  fn(); fn(); fn(); // warmup
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return {
    label,
    p50: t[Math.floor(runs * 0.5)],
    p95: t[Math.floor(runs * 0.95)],
    p99: t[Math.floor(runs * 0.99)],
  };
}

async function benchAsync(label, fn, runs = 5) {
  await fn(); await fn(); // warmup
  const t = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    await fn();
    t.push(performance.now() - s);
  }
  t.sort((a, b) => a - b);
  return { label, p50: t[Math.floor(runs * 0.5)], p95: t[Math.floor(runs * 0.95)] };
}

function row(r, unit = "ms") {
  const fmt = (n) =>
    unit === "ms" && n < 1 ? `${(n * 1000).toFixed(0)}µs` : `${n.toFixed(2)}ms`;
  console.log(`  ${r.label.padEnd(47)} p50 ${fmt(r.p50).padStart(8)}   p95 ${fmt(r.p95).padStart(8)}`);
  return r;
}

function improvement(before, after) {
  const x = before.p50 / after.p50;
  if (x >= 1000) return `${(x / 1000).toFixed(0)}000x`;
  if (x >= 100) return `${Math.round(x / 10) * 10}x`;
  return `${Math.round(x)}x`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════════╗");
  console.log("║         Nova Pyra Attendance — Performance Benchmark          ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`  ${STUDENTS} students · ${SESSIONS} sessions · ${RECORDS} attendance records`);
  console.log(`  Target PIN '9999' is student #${STUDENTS} — worst case for old bcrypt loop\n`);

  // ── 1. PIN Lookup ──────────────────────────────────────────────────────────
  console.log("━━━ 1. PIN LOOKUP  (kiosk critical path — every check-in/out) ━━━━");
  const dbPin = buildDb(false); // no indexes needed to prove bcrypt dominates

  const allStudents = dbPin.prepare(
    `SELECT student_id, display_name, first_name, pin_hash FROM students WHERE active_status = 1`
  );
  const findByPin = dbPin.prepare(
    `SELECT student_id, display_name, first_name FROM students WHERE pin = ? AND active_status = 1 LIMIT 1`
  );

  const pinBefore = await benchAsync(
    `OLD  load all ${STUDENTS} students + bcrypt loop`,
    async () => {
      const rows = allStudents.all();
      for (const s of rows) {
        if (await bcrypt.compare("9999", s.pin_hash)) break;
      }
    },
    5
  );

  const pinAfter = bench(
    "NEW  WHERE pin=? LIMIT 1  (no bcrypt)",
    () => findByPin.get("9999"),
    500
  );

  row(pinBefore);
  row(pinAfter);
  console.log(`\n  ✓ PIN lookup: ${improvement(pinBefore, pinAfter)} faster\n`);
  dbPin.close();

  // ── 2. Attendance Queries ──────────────────────────────────────────────────
  console.log("━━━ 2. ATTENDANCE QUERIES  (sessions end, reports, dashboard) ━━━━");

  const dbOld = buildDb(false);
  const dbNew = buildDb(true);

  const SEASON_START = "2025-01-01T00:00:00Z";
  const SEASON_END   = "2025-12-31T23:59:59Z";

  // Session attendance (dashboard / session-end bulk update)
  const sessOld = bench("OLD  session attendance JOIN (no idx)",
    () => dbOld.prepare(`SELECT ar.attendance_id, ar.check_in_time, ar.status, s.display_name, s.first_name FROM attendance_records ar JOIN students s ON s.student_id = ar.student_id WHERE ar.session_id = ? AND ar.status = 'checked_in'`).all("sess-active")
  );
  const sessNew = bench("NEW  session attendance JOIN (idx_att_session_status)",
    () => dbNew.prepare(`SELECT ar.attendance_id, ar.check_in_time, ar.status, s.display_name, s.first_name FROM attendance_records ar JOIN students s ON s.student_id = ar.student_id WHERE ar.session_id = ? AND ar.status = 'checked_in'`).all("sess-active")
  );
  row(sessOld); row(sessNew);
  console.log(`  ✓ ${improvement(sessOld, sessNew)} faster`);

  // Season aggregation (reports page)
  const SQL_AGG = `SELECT s.student_id, SUM(ar.total_minutes) AS total_minutes, COUNT(DISTINCT ar.session_id) AS session_count FROM attendance_records ar JOIN students s ON s.student_id = ar.student_id WHERE ar.status IN ('checked_out','manual_fixed') AND s.role = 'Student' AND ar.check_in_time >= ? AND ar.check_in_time <= ? GROUP BY s.student_id ORDER BY total_minutes DESC`;
  const aggOld = bench("OLD  season aggregation (no idx)",     () => dbOld.prepare(SQL_AGG).all(SEASON_START, SEASON_END));
  const aggNew = bench("NEW  season aggregation (with idx)",   () => dbNew.prepare(SQL_AGG).all(SEASON_START, SEASON_END));
  row(aggOld); row(aggNew);
  console.log(`  ✓ ${improvement(aggOld, aggNew)} faster`);

  // Per-student season sum (checkout response)
  const SQL_SUM = `SELECT SUM(total_minutes) AS total_minutes FROM attendance_records WHERE student_id = ? AND status IN ('checked_out','manual_fixed') AND check_in_time >= ?`;
  const sumOld = bench("OLD  per-student season sum (no idx)", () => dbOld.prepare(SQL_SUM).get("s0", SEASON_START));
  const sumNew = bench("NEW  per-student season sum (with idx)", () => dbNew.prepare(SQL_SUM).get("s0", SEASON_START));
  row(sumOld); row(sumNew);
  console.log(`  ✓ ${improvement(sumOld, sumNew)} faster`);

  dbOld.close();
  dbNew.close();

  // ── 3. Prepared Statement Caching ─────────────────────────────────────────
  console.log("\n━━━ 3. PREPARED STATEMENT CACHING  (all endpoints) ━━━━━━━━━━━━━━");
  const dbStmt = buildDb(false);
  const SQL_SESS = `SELECT session_id FROM sessions WHERE status = 'active' LIMIT 1`;
  const SQL_STUD = `SELECT student_id, first_name FROM students WHERE active_status = 1 ORDER BY last_name LIMIT 20`;

  const stmtOld1 = bench("OLD  prepare() on every call (active session)", () => dbStmt.prepare(SQL_SESS).get());
  const cached1  = dbStmt.prepare(SQL_SESS);
  const stmtNew1 = bench("NEW  cached prepared statement",                () => cached1.get());
  row(stmtOld1); row(stmtNew1);
  console.log(`  ✓ ${improvement(stmtOld1, stmtNew1)} faster`);

  const stmtOld2 = bench("OLD  prepare() on every call (student list)",  () => dbStmt.prepare(SQL_STUD).all());
  const cached2  = dbStmt.prepare(SQL_STUD);
  const stmtNew2 = bench("NEW  cached prepared statement",                () => cached2.all());
  row(stmtOld2); row(stmtNew2);
  console.log(`  ✓ ${improvement(stmtOld2, stmtNew2)} faster`);

  dbStmt.close();

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);
