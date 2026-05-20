import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();

  const session = db
    .prepare(
      `SELECT session_id, session_name, session_type, actual_start_time, status
       FROM sessions WHERE status = 'active' LIMIT 1`
    )
    .get() as { session_id: string; session_name: string; session_type: string; actual_start_time: string | null; status: string } | undefined;

  let attendance: { attendance_id: string; check_in_time: string; status: string; display_name: string | null; first_name: string }[] = [];
  if (session) {
    attendance = db
      .prepare(
        `SELECT ar.attendance_id, ar.check_in_time, ar.status,
                s.display_name, s.first_name
         FROM attendance_records ar
         JOIN students s ON s.student_id = ar.student_id
         WHERE ar.session_id = ? AND ar.status = 'checked_in'
         ORDER BY ar.check_in_time`
      )
      .all(session.session_id) as typeof attendance;
  }

  return NextResponse.json({ session: session ?? null, attendance });
}
