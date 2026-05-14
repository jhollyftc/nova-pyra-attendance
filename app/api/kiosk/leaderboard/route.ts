import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentSeason } from "@/lib/seasons";

export async function GET() {
  const db = getDb();
  const season = getCurrentSeason();

  const rows = db
    .prepare(
      `SELECT s.display_name, s.first_name,
              SUM(ar.total_minutes) AS total_minutes
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.status IN ('checked_out', 'manual_fixed')
         AND s.role = 'Student'
         AND ar.check_in_time >= ?
         AND ar.check_in_time <= ?
       GROUP BY s.student_id
       ORDER BY total_minutes DESC
       LIMIT 10`
    )
    .all(season.start.toISOString(), season.end.toISOString()) as {
      display_name: string | null;
      first_name: string;
      total_minutes: number;
    }[];

  const students = rows.map((r) => ({
    name: r.display_name ?? r.first_name,
    hours: parseFloat((r.total_minutes / 60).toFixed(1)),
  }));

  return NextResponse.json({ students, seasonName: season.name });
}
