import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { validate } from "@/lib/payload";

// Raw sockets and node crypto: this cannot run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Compares the bearer token without leaking its content through timing.
 *
 * Length is compared first and does leak, which is acceptable: the token's
 * length is not the secret. `timingSafeEqual` throws on mismatched lengths,
 * so this ordering is also required for correctness.
 */
function tokenOk(header: string | null): boolean {
  const expected = process.env.SYNC_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;

  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(expected);
  if (given.length !== want.length) return false;
  return timingSafeEqual(given, want);
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req.headers.get("authorization"))) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validate(body);
  if (!parsed.ok) {
    return NextResponse.json({ message: parsed.error }, { status: 400 });
  }

  const { season, members, sessions, records, pushed_at, schema_version } = parsed.snapshot;
  const sql = db();

  try {
    await sql.begin(async (tx) => {
      // ── Upserts ────────────────────────────────────────────
      await tx`
        INSERT INTO mirror.seasons (name, season_start, season_end)
        VALUES (${season.name}, ${season.start}, ${season.end})
        ON CONFLICT (name) DO UPDATE SET
          season_start = EXCLUDED.season_start, season_end = EXCLUDED.season_end
      `;

      if (members.length) {
        await tx`
          INSERT INTO mirror.members ${tx(
            members, "student_id", "label", "grade", "subteam", "role", "active"
          )}
          ON CONFLICT (student_id) DO UPDATE SET
            label = EXCLUDED.label, grade = EXCLUDED.grade,
            subteam = EXCLUDED.subteam, role = EXCLUDED.role,
            active = EXCLUDED.active, updated_at = now()
        `;
      }

      if (sessions.length) {
        await tx`
          INSERT INTO mirror.sessions ${tx(
            sessions, "session_id", "session_name", "session_type", "location",
            "session_date", "actual_start_time", "actual_end_time", "status"
          )}
          ON CONFLICT (session_id) DO UPDATE SET
            session_name = EXCLUDED.session_name, session_type = EXCLUDED.session_type,
            location = EXCLUDED.location, session_date = EXCLUDED.session_date,
            actual_start_time = EXCLUDED.actual_start_time,
            actual_end_time = EXCLUDED.actual_end_time,
            status = EXCLUDED.status, updated_at = now()
        `;
      }

      if (records.length) {
        await tx`
          INSERT INTO mirror.attendance_records ${tx(
            records, "attendance_id", "student_id", "session_id",
            "check_in_time", "check_out_time", "total_minutes", "status"
          )}
          ON CONFLICT (attendance_id) DO UPDATE SET
            student_id = EXCLUDED.student_id, session_id = EXCLUDED.session_id,
            check_in_time = EXCLUDED.check_in_time,
            check_out_time = EXCLUDED.check_out_time,
            total_minutes = EXCLUDED.total_minutes,
            status = EXCLUDED.status, updated_at = now()
        `;
      }

      // ── Deletions ──────────────────────────────────────────
      // The push is a full snapshot, so anything inside this season's window
      // that it no longer mentions has been deleted on the kiosk.
      //
      // Scoping to the season window is critical: unscoped, a push of the
      // current season would wipe every previous season.
      const recordIds = records.map((r) => r.attendance_id);
      await tx`
        DELETE FROM mirror.attendance_records
        WHERE check_in_time >= ${season.start} AND check_in_time <= ${season.end}
          AND NOT (attendance_id = ANY(${recordIds}::uuid[]))
      `;

      const sessionIds = sessions.map((s) => s.session_id);
      await tx`
        DELETE FROM mirror.sessions
        WHERE session_date >= ${season.start.slice(0, 10)}
          AND session_date <= ${season.end.slice(0, 10)}
          AND NOT (session_id = ANY(${sessionIds}::uuid[]))
      `;

      // Members are never deleted here: one can appear in an earlier season
      // that this push does not cover.

      await tx`
        INSERT INTO mirror.sync_log
          (season, pushed_at, record_count, member_count, session_count, schema_version)
        VALUES (${season.name}, ${pushed_at}, ${records.length},
                ${members.length}, ${sessions.length}, ${schema_version})
      `;
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("sync failed:", message);
    return NextResponse.json({ message: "Sync failed: " + message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    season: season.name,
    members: members.length,
    sessions: sessions.length,
    records: records.length,
  });
}
