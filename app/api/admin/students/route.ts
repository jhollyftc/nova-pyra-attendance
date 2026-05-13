import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  const students = db
    .prepare(
      `SELECT student_id, first_name, last_name, display_name, grade, subteam, role, active_status
       FROM students ORDER BY last_name`
    )
    .all();

  return NextResponse.json(students);
}
