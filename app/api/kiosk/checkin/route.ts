import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";

function err(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function todaySessionName() {
  return (
    "Build Session — " +
    new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.pin || !/^\d{4}$/.test(body.pin)) {
    return err("Invalid PIN.", 400);
  }

  const { pin } = body as { pin: string };
  const db = getDb();

  // Find or auto-create today's active session
  let session = db
    .prepare(`SELECT session_id FROM sessions WHERE status = 'active' LIMIT 1`)
    .get() as { session_id: string } | undefined;

  if (!session) {
    const now = new Date();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO sessions (session_id, session_name, session_type, session_date, actual_start_time, status)
       VALUES (?, ?, 'Regular Build', ?, ?, 'active')`
    ).run(id, todaySessionName(), now.toISOString().split("T")[0], now.toISOString());
    session = { session_id: id };
  }

  // Find matching student
  const students = db
    .prepare(`SELECT student_id, display_name, first_name, pin_hash FROM students WHERE active_status = 1`)
    .all() as { student_id: string; display_name: string | null; first_name: string; pin_hash: string }[];

  if (!students.length) return err("Invalid PIN.", 401);

  let matched: (typeof students)[0] | null = null;
  for (const student of students) {
    if (await bcrypt.compare(pin, student.pin_hash)) {
      matched = student;
      break;
    }
  }

  if (!matched) return err("Invalid PIN.", 401);

  // Guard against duplicate check-in
  const existing = db
    .prepare(
      `SELECT attendance_id FROM attendance_records
       WHERE student_id = ? AND session_id = ? AND status = 'checked_in' LIMIT 1`
    )
    .get(matched.student_id, session.session_id);

  if (existing) return err("Already checked in.", 409);

  const checkInTime = new Date();
  db.prepare(
    `INSERT INTO attendance_records (attendance_id, student_id, session_id, check_in_time, status)
     VALUES (?, ?, ?, ?, 'checked_in')`
  ).run(randomUUID(), matched.student_id, session.session_id, checkInTime.toISOString());

  const timeStr = checkInTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return NextResponse.json({
    message: `See you later, ${matched.display_name ?? matched.first_name}!`,
    detail: `Checked in at ${timeStr}`,
  });
}
