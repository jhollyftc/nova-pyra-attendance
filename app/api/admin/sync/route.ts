import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getSyncState, pushSnapshot } from "@/lib/sync";

async function authed(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token ? await verifyToken(token) : false;
}

/** Current sync status, for the dashboard card. */
export async function GET(req: NextRequest) {
  if (!await authed(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    ...getSyncState(),
    configured: Boolean(process.env.SYNC_URL && process.env.SYNC_TOKEN),
  });
}

/** Manual push. Unlike the automatic one, this ignores the daily interval. */
export async function POST(req: NextRequest) {
  if (!await authed(req)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const result = await pushSnapshot(body?.season as string | undefined);

  if (!result.ok) {
    const status =
      result.kind === "input" ? 400 : result.kind === "config" ? 503 : 502;
    return NextResponse.json({ message: result.error, kind: result.kind }, { status });
  }

  return NextResponse.json({
    message: `Pushed ${result.recordCount} records for ${result.season}.`,
    recordCount: result.recordCount,
    season: result.season,
  });
}
