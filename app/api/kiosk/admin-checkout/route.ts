import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

function err(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.attendanceId || !body?.password) {
    return err("Missing fields.", 400);
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return err("Admin password not configured.", 500);

  const ok = await bcrypt.compare(body.password as string, hash);
  if (!ok) return err("Incorrect password.", 401);

  const db = getDb();

  const record = db
    .prepare(
      `SELECT ar.attendance_id, ar.check_in_time, ar.status,
              COALESCE(s.display_name, s.first_name) AS name
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.attendance_id = ?`
    )
    .get(body.attendanceId as string) as
    | { attendance_id: string; check_in_time: string; status: string; name: string }
    | undefined;

  if (!record) return err("Record not found.", 404);
  if (record.status !== "checked_in") return err("Not currently checked in.", 409);

  const checkOutTime = new Date();
  const totalMinutes = Math.round(
    (checkOutTime.getTime() - new Date(record.check_in_time).getTime()) / 60000
  );

  db.prepare(
    `UPDATE attendance_records
     SET check_out_time = ?, total_minutes = ?, status = 'checked_out', updated_at = datetime('now')
     WHERE attendance_id = ?`
  ).run(checkOutTime.toISOString(), totalMinutes, record.attendance_id);

  return NextResponse.json({ message: `${record.name} checked out.` });
}
