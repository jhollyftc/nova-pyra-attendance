"use server";

import bcrypt from "bcryptjs";
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

export type StudentFormData = {
  first_name: string;
  last_name: string;
  display_name: string;
  grade: string;
  subteam: string;
  role: string;
  pin: string;
};

export async function createStudent(data: StudentFormData) {
  if (!await checkAuth()) return { error: "Unauthorized." };
  if (!/^\d{4}$/.test(data.pin)) return { error: "PIN must be exactly 4 digits." };

  const pin_hash = await bcrypt.hash(data.pin, 10);
  const db = getDb();

  db.prepare(
    `INSERT INTO students (student_id, first_name, last_name, display_name, grade, subteam, role, pin_hash, pin, active_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    randomUUID(),
    data.first_name.trim(),
    data.last_name.trim(),
    data.display_name.trim() || null,
    data.grade.trim() || null,
    data.subteam.trim() || null,
    data.role.trim() || null,
    pin_hash,
    data.pin
  );

  revalidatePath("/admin/students");
  return { success: true };
}

export async function updateStudent(
  studentId: string,
  data: Omit<StudentFormData, "pin">
) {
  if (!await checkAuth()) return { error: "Unauthorized." };

  const db = getDb();
  db.prepare(
    `UPDATE students SET first_name = ?, last_name = ?, display_name = ?,
      grade = ?, subteam = ?, role = ?, updated_at = datetime('now')
     WHERE student_id = ?`
  ).run(
    data.first_name.trim(),
    data.last_name.trim(),
    data.display_name.trim() || null,
    data.grade.trim() || null,
    data.subteam.trim() || null,
    data.role.trim() || null,
    studentId
  );

  revalidatePath("/admin/students");
  return { success: true };
}

export async function resetPin(studentId: string, pin: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };
  if (!/^\d{4}$/.test(pin)) return { error: "PIN must be exactly 4 digits." };

  const pin_hash = await bcrypt.hash(pin, 10);
  const db = getDb();
  db.prepare(
    `UPDATE students SET pin_hash = ?, pin = ?, updated_at = datetime('now') WHERE student_id = ?`
  ).run(pin_hash, pin, studentId);

  return { success: true };
}

export async function archiveStudent(studentId: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };

  const db = getDb();
  db.prepare(
    `UPDATE students SET active_status = 0, updated_at = datetime('now') WHERE student_id = ?`
  ).run(studentId);

  revalidatePath("/admin/students");
  return { success: true };
}

export async function restoreStudent(studentId: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };

  const db = getDb();
  db.prepare(
    `UPDATE students SET active_status = 1, updated_at = datetime('now') WHERE student_id = ?`
  ).run(studentId);

  revalidatePath("/admin/students");
  return { success: true };
}

export async function getAttendanceCount(studentId: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };

  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM attendance_records WHERE student_id = ?`)
    .get(studentId) as { count: number };

  return { count: row.count };
}

export async function deleteStudent(studentId: string) {
  if (!await checkAuth()) return { error: "Unauthorized." };

  const db = getDb();
  db.prepare(`DELETE FROM attendance_records WHERE student_id = ?`).run(studentId);
  db.prepare(`DELETE FROM students WHERE student_id = ?`).run(studentId);

  revalidatePath("/admin/students");
  return { success: true };
}
