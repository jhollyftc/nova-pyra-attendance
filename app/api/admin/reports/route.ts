import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { getCurrentSeason } from "@/lib/seasons";

const FAR_FUTURE = "9999-12-31T23:59:59.999Z";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const period = searchParams.get("period") ?? "season";

  const now = new Date();
  let fromDate: string;
  let toDate: string;

  if (fromParam) {
    fromDate = fromParam;
    toDate = toParam ?? FAR_FUTURE;
  } else if (period === "month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    toDate = FAR_FUTURE;
  } else {
    const season = getCurrentSeason(now);
    fromDate = season.start.toISOString();
    toDate = season.end.toISOString();
  }

  const fromDay = fromDate.split("T")[0];
  const toDay = toDate.split("T")[0];

  const db = getDb();

  // Per-student totals
  const summaryRows = db.prepare(
    `SELECT s.student_id, s.display_name, s.first_name, s.last_name, s.grade, s.subteam,
            SUM(ar.total_minutes) AS total_minutes,
            COUNT(DISTINCT ar.session_id) AS session_count
     FROM attendance_records ar
     JOIN students s ON s.student_id = ar.student_id
     WHERE ar.status IN ('checked_out', 'manual_fixed')
       AND s.role = 'Student'
       AND ar.check_in_time >= ?
       AND ar.check_in_time <= ?
     GROUP BY s.student_id
     ORDER BY total_minutes DESC`
  ).all(fromDate, toDate) as {
    student_id: string; display_name: string | null;
    first_name: string; last_name: string;
    grade: string | null; subteam: string | null;
    total_minutes: number; session_count: number;
  }[];

  const summaries = summaryRows.map((r) => ({
    student_id: r.student_id,
    name: r.display_name ?? `${r.first_name} ${r.last_name}`,
    grade: r.grade,
    subteam: r.subteam,
    total_minutes: r.total_minutes ?? 0,
    session_count: r.session_count,
  }));

  // Session attendance trend
  const sessionTrend = db.prepare(
    `SELECT sess.session_name, sess.session_date,
            COUNT(DISTINCT ar.student_id) AS student_count
     FROM sessions sess
     LEFT JOIN attendance_records ar
       ON ar.session_id = sess.session_id
       AND ar.status IN ('checked_out', 'manual_fixed', 'missing_checkout', 'checked_in')
     WHERE sess.status IN ('active', 'ended')
       AND sess.session_date >= ?
       AND sess.session_date <= ?
     GROUP BY sess.session_id
     ORDER BY sess.session_date ASC`
  ).all(fromDay, toDay) as {
    session_name: string; session_date: string; student_count: number;
  }[];

  // Subteam breakdown
  const subteamRows = db.prepare(
    `SELECT COALESCE(s.subteam, 'Unassigned') AS subteam,
            SUM(ar.total_minutes) AS total_minutes
     FROM attendance_records ar
     JOIN students s ON s.student_id = ar.student_id
     WHERE ar.status IN ('checked_out', 'manual_fixed')
       AND s.role = 'Student'
       AND ar.check_in_time >= ?
       AND ar.check_in_time <= ?
     GROUP BY subteam
     ORDER BY total_minutes DESC`
  ).all(fromDate, toDate) as { subteam: string; total_minutes: number }[];

  const subteamBreakdown = subteamRows.map((r) => ({
    subteam: r.subteam,
    hours: parseFloat((r.total_minutes / 60).toFixed(1)),
  }));

  // Per-adult totals (Mentor, Coach, Parent)
  const adultRows = db.prepare(
    `SELECT s.student_id, s.display_name, s.first_name, s.last_name, s.role,
            SUM(ar.total_minutes) AS total_minutes,
            COUNT(DISTINCT ar.session_id) AS session_count
     FROM attendance_records ar
     JOIN students s ON s.student_id = ar.student_id
     WHERE ar.status IN ('checked_out', 'manual_fixed')
       AND s.role IN ('Mentor', 'Coach', 'Parent', 'Student Mentor')
       AND ar.check_in_time >= ?
       AND ar.check_in_time <= ?
     GROUP BY s.student_id
     ORDER BY s.role ASC, total_minutes DESC`
  ).all(fromDate, toDate) as {
    student_id: string; display_name: string | null;
    first_name: string; last_name: string;
    role: string; total_minutes: number; session_count: number;
  }[];

  const adultSummaries = adultRows.map((r) => ({
    student_id: r.student_id,
    name: r.display_name ?? `${r.first_name} ${r.last_name}`,
    role: r.role,
    total_minutes: r.total_minutes ?? 0,
    session_count: r.session_count,
  }));

  // Hours by adult category
  const adultCategoryRows = db.prepare(
    `SELECT s.role, SUM(ar.total_minutes) AS total_minutes
     FROM attendance_records ar
     JOIN students s ON s.student_id = ar.student_id
     WHERE ar.status IN ('checked_out', 'manual_fixed')
       AND s.role IN ('Mentor', 'Coach', 'Parent', 'Student Mentor')
       AND ar.check_in_time >= ?
       AND ar.check_in_time <= ?
     GROUP BY s.role
     ORDER BY total_minutes DESC`
  ).all(fromDate, toDate) as { role: string; total_minutes: number }[];

  const adultCategoryBreakdown = adultCategoryRows.map((r) => ({
    role: r.role,
    hours: parseFloat((r.total_minutes / 60).toFixed(1)),
  }));

  return NextResponse.json({ summaries, sessionTrend, subteamBreakdown, adultSummaries, adultCategoryBreakdown });
}
