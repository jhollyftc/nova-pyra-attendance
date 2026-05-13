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
    return NextResponse.json({ message: "sessionId required." }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    `UPDATE sessions SET status = 'active', actual_start_time = ?, updated_at = datetime('now')
     WHERE session_id = ? AND status = 'scheduled'`
  ).run(new Date().toISOString(), body.sessionId);

  return NextResponse.json({ success: true });
}
