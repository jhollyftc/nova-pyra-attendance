import { NextRequest, NextResponse } from "next/server";
import postgres from "postgres";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Connection diagnostics, reported from inside the deployment.
 *
 * Whether the database is reachable from a laptop says nothing about whether
 * it is reachable from a serverless function. This reports what the function
 * itself sees — the host it is dialling, and how each TLS mode behaves —
 * without ever revealing the credentials.
 *
 * Gated on the session cookie: it discloses infrastructure details.
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

  // Report the shape of the value without leaking the password.
  let parsed: Record<string, unknown>;
  try {
    const u = new URL(raw);
    parsed = {
      host: u.hostname,
      port: u.port,
      user: u.username,
      userHasDot: u.username.includes("."),
      database: u.pathname.replace("/", ""),
      hasPassword: Boolean(u.password),
      passwordLength: u.password.length,
      search: u.search || null,
      rawLength: raw.length,
      trimmedDiffers: raw !== raw.trim(),
      wrappedInQuotes: /^["'].*["']$/.test(raw.trim()),
    };
  } catch (e) {
    return NextResponse.json({
      configured: true,
      parseError: e instanceof Error ? e.message : String(e),
      rawLength: raw.length,
    });
  }

  const attempts: Record<string, unknown>[] = [];
  for (const [label, ssl] of [
    ["ssl-require", "require"],
    ["ssl-noverify", { rejectUnauthorized: false }],
    ["no-ssl", false],
  ] as const) {
    const started = Date.now();
    const sql = postgres(raw, { prepare: false, max: 1, connect_timeout: 6, ssl });
    try {
      await sql`select 1 as ok`;
      attempts.push({ mode: label, ok: true, ms: Date.now() - started });
    } catch (e) {
      const err = e as { code?: string; errno?: string; message?: string };
      attempts.push({
        mode: label,
        ok: false,
        ms: Date.now() - started,
        code: err.code ?? err.errno ?? null,
        message: (err.message ?? String(e)).slice(0, 300),
      });
    } finally {
      try { await sql.end({ timeout: 3 }); } catch {}
    }
  }

  return NextResponse.json({ configured: true, region: process.env.VERCEL_REGION ?? null, parsed, attempts });
}
