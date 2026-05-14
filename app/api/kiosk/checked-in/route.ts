import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT s.display_name, s.first_name, ar.check_in_time
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.status = 'checked_in'
       ORDER BY COALESCE(s.display_name, s.first_name) ASC`
    )
    .all() as { display_name: string | null; first_name: string; check_in_time: string }[];

  const students = rows.map((r) => ({
    name: r.display_name ?? r.first_name,
    checkInTime: r.check_in_time,
  }));

  return NextResponse.json({ students });
}
