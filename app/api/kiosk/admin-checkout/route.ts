import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { checkOutRecord } from "@/lib/attendance";

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

  // An explicit checkOutTime back-dates a forgotten check-out; the helper
  // validates the range and flags the record when it is a real adjustment.
  const at = body.checkOutTime ? new Date(body.checkOutTime as string) : undefined;
  const result = checkOutRecord(body.attendanceId as string, "kiosk", at);
  if (!result.ok) return err(result.message, result.status);

  return NextResponse.json({
    message: `${result.name} checked out.`,
    adjusted: result.adjusted,
  });
}
