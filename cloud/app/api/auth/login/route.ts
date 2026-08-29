import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSession, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password = body?.password;
  if (typeof password !== "string" || !password) {
    return NextResponse.json({ message: "Password required." }, { status: 400 });
  }

  const hash = process.env.APP_PASSWORD_HASH;
  if (!hash) {
    return NextResponse.json({ message: "Server is not configured." }, { status: 503 });
  }

  if (!(await bcrypt.compare(password, hash))) {
    return NextResponse.json({ message: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await signSession(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
