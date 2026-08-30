import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { localDateStr } from "@/lib/buildDay";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Downloads a consistent snapshot of the kiosk database.
 *
 * This machine holds the only copy of the roster: first names, surnames and
 * PINs live nowhere else. The cloud mirror is not a backup — it carries
 * pseudonymous labels and deliberately cannot reconstruct a member.
 *
 * Uses SQLite's online backup rather than copying the file. The database runs
 * in WAL mode, so recent transactions may still be in nova-pyra.db-wal and a
 * plain file copy would silently omit them.
 *
 * The downloaded file contains plaintext PINs. It is a credential store, not
 * just data.
 */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const tmp = path.join(os.tmpdir(), `nova-pyra-backup-${randomUUID()}.db`);

  try {
    await getDb().backup(tmp);
    const data = await fs.promises.readFile(tmp);
    const name = `nova-pyra-backup-${localDateStr(new Date())}.db`;

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": String(data.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ message: `Backup failed: ${message}` }, { status: 500 });
  } finally {
    fs.promises.unlink(tmp).catch(() => {
      /* best effort; the OS clears its temp directory */
    });
  }
}
