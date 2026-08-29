import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { checkOutRecord } from "@/lib/attendance";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.attendanceId) {
    return NextResponse.json({ message: "attendanceId required." }, { status: 400 });
  }

  // Already authenticated by the session cookie, so no password prompt here —
  // unlike the kiosk, which is unauthenticated by design.
  // An explicit checkOutTime back-dates a forgotten check-out; the helper
  // validates the range and flags the record when it is a real adjustment.
  const at = body.checkOutTime ? new Date(body.checkOutTime as string) : undefined;
  const result = checkOutRecord(body.attendanceId as string, "admin", at);

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  return NextResponse.json({
    message: `${result.name} checked out.`,
    name: result.name,
    totalMinutes: result.totalMinutes,
    adjusted: result.adjusted,
  });
}
