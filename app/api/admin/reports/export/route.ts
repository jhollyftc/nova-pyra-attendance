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
  const labelParam = searchParams.get("label");
  const period = searchParams.get("period") ?? "season";

  const now = new Date();
  let fromDate: string;
  let toDate: string;
  let label: string;

  if (fromParam) {
    fromDate = fromParam;
    toDate = toParam ?? FAR_FUTURE;
    label = labelParam ?? "custom";
  } else if (period === "month") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    toDate = FAR_FUTURE;
    label = "this-month";
  } else {
    const season = getCurrentSeason(now);
    fromDate = season.start.toISOString();
    toDate = season.end.toISOString();
    label = season.name;
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.display_name, s.first_name, s.last_name, s.grade, s.subteam,
              SUM(ar.total_minutes) AS total_minutes
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.status IN ('checked_out', 'manual_fixed')
         AND ar.check_in_time >= ?
         AND ar.check_in_time <= ?
       GROUP BY s.student_id
       ORDER BY total_minutes DESC`
    )
    .all(fromDate, toDate) as {
      display_name: string | null;
      first_name: string;
      last_name: string;
      grade: string | null;
      subteam: string | null;
      total_minutes: number;
    }[];

  const toHours = (m: number) => (m / 60).toFixed(2);
  const header = "Name,Grade,Subteam,Total Hours\r\n";
  const body = rows
    .map((r) => {
      const name = r.display_name ?? `${r.first_name} ${r.last_name}`;
      return `"${name}","${r.grade ?? ""}","${r.subteam ?? ""}",${toHours(r.total_minutes ?? 0)}`;
    })
    .join("\r\n");

  const safeLabel = label.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `nova-pyra-${safeLabel}-${now.toISOString().split("T")[0]}.csv`;

  return new NextResponse(header + body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
