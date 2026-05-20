import { NextRequest, NextResponse } from "next/server";
import { findStudentByPin, stmt } from "@/lib/db";
import { getCurrentSeason } from "@/lib/seasons";

function err(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.pin || !/^\d{4}$/.test(body.pin)) {
    return err("Invalid PIN.", 400);
  }

  const { pin } = body as { pin: string };

  const matched = findStudentByPin(pin);
  if (!matched) return err("Invalid PIN.", 401);

  const record = stmt(
    `SELECT attendance_id, check_in_time FROM attendance_records
     WHERE student_id = ? AND status = 'checked_in'
     ORDER BY check_in_time DESC LIMIT 1`
  ).get(matched.student_id) as { attendance_id: string; check_in_time: string } | undefined;

  if (!record) return err("Not currently checked in.", 404);

  const checkOutTime = new Date();
  const totalMinutes = Math.round(
    (checkOutTime.getTime() - new Date(record.check_in_time).getTime()) / 60000
  );

  stmt(
    `UPDATE attendance_records
     SET check_out_time = ?, total_minutes = ?, status = 'checked_out', updated_at = datetime('now')
     WHERE attendance_id = ?`
  ).run(checkOutTime.toISOString(), totalMinutes, record.attendance_id);

  const displayName = matched.display_name ?? matched.first_name;
  const timeStr = checkOutTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const duration = hours > 0 ? `${hours} hr ${mins} min` : `${mins} min`;

  // Season total (Sept 1 of current or previous year)
  const now = new Date();
  const season = getCurrentSeason(now);
  const seasonStart = season.start.toISOString();

  const seasonRow = stmt(
    `SELECT SUM(total_minutes) AS total_minutes
     FROM attendance_records
     WHERE student_id = ? AND status IN ('checked_out', 'manual_fixed') AND check_in_time >= ?`
  ).get(matched.student_id, seasonStart) as { total_minutes: number | null };

  const seasonMins = seasonRow?.total_minutes ?? 0;
  const seasonHours = (seasonMins / 60).toFixed(1);

  const MILESTONE_MINS = [25, 50, 100, 150, 200, 300, 500].map((h) => h * 60);
  const prevSeasonMins = seasonMins - totalMinutes;
  const hit = MILESTONE_MINS.filter((m) => prevSeasonMins < m && m <= seasonMins);
  const milestone = hit.length ? `${hit[hit.length - 1] / 60} hrs` : undefined;

  return NextResponse.json({
    message: `Great work, ${displayName}!`,
    detail: `Checked out at ${timeStr}`,
    stats: `Session: ${duration}  ·  Season: ${seasonHours} hrs`,
    milestone,
  });
}
