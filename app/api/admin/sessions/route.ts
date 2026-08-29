import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { rolloverStaleSessions } from "@/lib/rollover";
import { randomUUID } from "crypto";

function authErr() {
  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

async function checkAuth(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : false;
}

export async function GET(req: NextRequest) {
  if (!await checkAuth(req)) return authErr();

  rolloverStaleSessions();

  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT session_id, session_name, session_type, location, session_date,
              actual_start_time, actual_end_time, status, notes
       FROM sessions ORDER BY session_date DESC, created_at DESC`
    )
    .all();

  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  if (!await checkAuth(req)) return authErr();

  const body = await req.json().catch(() => null);
  if (!body?.session_name?.trim()) {
    return NextResponse.json({ message: "Session name required." }, { status: 400 });
  }

  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO sessions (session_id, session_name, session_type, location, session_date,
      actual_start_time, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.session_name.trim(),
    body.session_type ?? "Regular Build",
    body.location?.trim() || null,
    body.session_date ?? now.split("T")[0],
    body.start_now ? now : null,
    body.start_now ? "active" : "scheduled",
    body.notes?.trim() || null
  );

  return NextResponse.json({ session_id: id });
}

export async function PUT(req: NextRequest) {
  if (!await checkAuth(req)) return authErr();

  const body = await req.json().catch(() => null);
  if (!body?.session_id || !body?.session_name?.trim()) {
    return NextResponse.json({ message: "session_id and session_name required." }, { status: 400 });
  }

  const db = getDb();
  db.prepare(
    `UPDATE sessions SET session_name = ?, session_type = ?, location = ?,
      session_date = ?, notes = ?, updated_at = datetime('now')
     WHERE session_id = ?`
  ).run(
    body.session_name.trim(),
    body.session_type ?? "Regular Build",
    body.location?.trim() || null,
    body.session_date,
    body.notes?.trim() || null,
    body.session_id
  );

  return NextResponse.json({ success: true });
}
