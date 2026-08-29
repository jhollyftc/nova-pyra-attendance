import { NextRequest, NextResponse } from "next/server";
import { findStudentByPin, stmt } from "@/lib/db";
import { rolloverStaleSessions } from "@/lib/rollover";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.pin || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 400 });
  }

  const matched = findStudentByPin(body.pin);
  if (!matched) {
    return NextResponse.json({ message: "Invalid PIN." }, { status: 401 });
  }

  const studentName = matched.display_name ?? matched.first_name;

  rolloverStaleSessions();

  const session = stmt(
    `SELECT session_id FROM sessions WHERE status = 'active' LIMIT 1`
  ).get() as { session_id: string } | undefined;

  if (!session) {
    return NextResponse.json({ studentName, action: "checkin" });
  }

  const openRecord = stmt(
    `SELECT attendance_id FROM attendance_records
     WHERE student_id = ? AND session_id = ? AND status = 'checked_in' LIMIT 1`
  ).get(matched.student_id, session.session_id);

  return NextResponse.json({
    studentName,
    action: openRecord ? "checkout" : "checkin",
  });
}
