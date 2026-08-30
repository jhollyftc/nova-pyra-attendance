import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signSession, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

/** A bcrypt hash always starts with $2a$, $2b$ or $2y$ and is 60 chars long. */
function isBcryptHash(v: string): boolean {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(v);
}

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

  // Distinguish "wrong password" from "the stored value is not a hash at all",
  // which otherwise looks identical to the user and is a far more likely
  // mistake: pasting the plaintext password, or a value with quotes around it.
  if (!isBcryptHash(hash.trim())) {
    return NextResponse.json(
      {
        message:
          "APP_PASSWORD_HASH is not a bcrypt hash. It must be the $2b$10$… string from " +
          "`npm run hash`, not the password itself.",
      },
      { status: 503 }
    );
  }

  if (!(await bcrypt.compare(password, hash.trim()))) {
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
