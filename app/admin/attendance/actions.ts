"use server";

import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

async function checkAuth() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : false;
}

export async function correctAttendance(
  attendanceId: string,
  checkInTime: string,
  checkOutTime: string,
  editReason: string
) {
  if (!await checkAuth()) return { error: "Unauthorized." };
  if (!editReason.trim()) return { error: "Edit reason is required." };

  const checkIn = new Date(checkInTime);
  const checkOut = new Date(checkOutTime);
  if (checkOut <= checkIn) return { error: "Check-out must be after check-in." };

  const totalMinutes = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
  const db = getDb();

  db.prepare(
    `UPDATE attendance_records
     SET check_in_time = ?, check_out_time = ?, total_minutes = ?,
         status = 'manual_fixed', edit_reason = ?, updated_at = datetime('now')
     WHERE attendance_id = ?`
  ).run(checkIn.toISOString(), checkOut.toISOString(), totalMinutes, editReason.trim(), attendanceId);

  db.prepare(
    `INSERT INTO audit_logs (id, action, table_name, record_id, new_values)
     VALUES (?, 'correct_attendance', 'attendance_records', ?, ?)`
  ).run(
    randomUUID(),
    attendanceId,
    JSON.stringify({ check_in_time: checkInTime, check_out_time: checkOutTime, totalMinutes })
  );

  revalidatePath("/admin/attendance");
  return { success: true };
}

export async function voidAttendance(attendanceId: string, editReason: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };
  if (!editReason.trim()) return { error: "Edit reason is required." };

  const db = getDb();

  db.prepare(
    `UPDATE attendance_records
     SET status = 'voided', edit_reason = ?, updated_at = datetime('now')
     WHERE attendance_id = ?`
  ).run(editReason.trim(), attendanceId);

  db.prepare(
    `INSERT INTO audit_logs (id, action, table_name, record_id)
     VALUES (?, 'void_attendance', 'attendance_records', ?)`
  ).run(randomUUID(), attendanceId);

  revalidatePath("/admin/attendance");
  return { success: true };
}
