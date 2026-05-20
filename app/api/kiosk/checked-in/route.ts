import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.display_name, s.first_name, s.role, ar.check_in_time, ar.attendance_id
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.status = 'checked_in'
       ORDER BY COALESCE(s.display_name, s.first_name) ASC`
    )
    .all() as { display_name: string | null; first_name: string; role: string | null; check_in_time: string; attendance_id: string }[];

  const students = rows.map((r) => ({
    name: r.display_name ?? r.first_name,
    role: r.role ?? "Student",
    checkInTime: r.check_in_time,
    attendanceId: r.attendance_id,
  }));

  return NextResponse.json({ students });
}
