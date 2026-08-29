import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { db, looksPooled, withTimeout } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connection check, reported from inside the deployment.
 *
 * Reachability from a laptop says nothing about reachability from a serverless
 * function — this answers the latter. Credentials are never disclosed, only
 * the shape of the value, which is enough to catch one pasted with quotes,
 * whitespace, or the placeholder left in.
 *
 * Gated on the session cookie: it reveals infrastructure details.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return NextResponse.json({ configured: false, message: "DATABASE_URL is not set." });
  }

  let shape: Record<string, unknown> = {};
  try {
    const u = new URL(raw);
    shape = {
      host: u.hostname,
      port: u.port,
      userHasDot: u.username.includes("."),
      pooled: looksPooled(raw),
      hasPassword: Boolean(u.password),
    };
  } catch {
    shape = { parseError: true, rawLength: raw.length };
  }

  const started = Date.now();
  try {
    await withTimeout(db()`select 1 as ok`, 5000);
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      region: process.env.VERCEL_REGION ?? null,
      shape,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        region: process.env.VERCEL_REGION ?? null,
        shape,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 503 }
    );
  }
}
