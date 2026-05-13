import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSession, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.password) {
    return NextResponse.json({ message: "Password required." }, { status: 400 });
  }

  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) {
    return NextResponse.json({ message: "Admin password not configured." }, { status: 500 });
  }

  const ok = await bcrypt.compare(body.password, hash);
  if (!ok) {
    return NextResponse.json({ message: "Invalid password." }, { status: 401 });
  }

  const token = await signSession();
  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}
