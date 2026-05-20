import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const records = db
    .prepare(
      `SELECT ar.attendance_id, ar.check_in_time, ar.check_out_time, ar.total_minutes,
              ar.status, ar.edit_reason,
              s.display_name AS student_display_name,
              s.first_name AS student_first_name,
              s.last_name AS student_last_name,
              sess.session_name, sess.session_date
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       JOIN sessions sess ON sess.session_id = ar.session_id
       ORDER BY ar.check_in_time DESC
       LIMIT 500`
    )
    .all();

  return NextResponse.json(records);
}
