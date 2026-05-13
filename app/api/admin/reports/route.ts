import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "season";

  const now = new Date();
  let fromDate: string;
  if (period === "month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  } else {
    const seasonYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    fromDate = new Date(seasonYear, 8, 1).toISOString();
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.student_id, s.display_name, s.first_name, s.last_name, s.grade, s.subteam,
              SUM(ar.total_minutes) AS total_minutes,
              COUNT(DISTINCT ar.session_id) AS session_count
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.status IN ('checked_out', 'manual_fixed')
         AND ar.check_in_time >= ?
       GROUP BY s.student_id
       ORDER BY total_minutes DESC`
    )
    .all(fromDate) as {
      student_id: string;
      display_name: string | null;
      first_name: string;
      last_name: string;
      grade: string | null;
      subteam: string | null;
      total_minutes: number;
      session_count: number;
    }[];

  const summaries = rows.map((r) => ({
    student_id: r.student_id,
    name: r.display_name ?? `${r.first_name} ${r.last_name}`,
    grade: r.grade,
    subteam: r.subteam,
    total_minutes: r.total_minutes ?? 0,
    session_count: r.session_count,
  }));

  return NextResponse.json(summaries);
}
