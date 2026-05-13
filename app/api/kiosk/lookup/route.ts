import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.pin || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 400 });
  }

  const db = getDb();
  const students = db
    .prepare(`SELECT student_id, display_name, first_name, pin_hash FROM students WHERE active_status = 1`)
    .all() as { student_id: string; display_name: string | null; first_name: string; pin_hash: string }[];

  if (!students.length) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 401 });
  }

  let matched: (typeof students)[0] | null = null;
  for (const student of students) {
    if (await bcrypt.compare(body.pin, student.pin_hash)) {
      matched = student;
      break;
    }
  }

  if (!matched) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 401 });
  }

  const studentName = matched.display_name ?? matched.first_name;

  const session = db
    .prepare(`SELECT session_id FROM sessions WHERE status = 'active' LIMIT 1`)
    .get() as { session_id: string } | undefined;

  if (!session) {
    return NextResponse.json({ studentName, action: "checkin" });
  }

  const openRecord = db
    .prepare(
      `SELECT attendance_id FROM attendance_records
       WHERE student_id = ? AND session_id = ? AND status = 'checked_in' LIMIT 1`
    )
    .get(matched.student_id, session.session_id);

  return NextResponse.json({
    studentName,
    action: openRecord ? "checkout" : "checkin",
  });
}
