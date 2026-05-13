import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !await verifyToken(token)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.sessionId) {
    return NextResponse.json({ message: "Missing sessionId" }, { status: 400 });
  }

  const db = getDb();
  const endTime = new Date().toISOString();

  db.prepare(
    `UPDATE sessions SET status = 'ended', actual_end_time = ?, updated_at = datetime('now')
     WHERE session_id = ? AND status = 'active'`
  ).run(endTime, body.sessionId);

  const result = db.prepare(
    `UPDATE attendance_records
     SET status = 'missing_checkout', check_out_time = ?, updated_at = datetime('now')
     WHERE session_id = ? AND status = 'checked_in'`
  ).run(endTime, body.sessionId);

  return NextResponse.json({ success: true, missedCount: result.changes });
}
