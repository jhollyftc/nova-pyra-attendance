import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { memberTotals, seasons, lastSyncFor, type Season, type MemberTotal, type SyncInfo } from "@/lib/report";
import { looksPooled, withTimeout } from "@/lib/db";
import SeasonPicker from "./SeasonPicker";

// Always reflects the latest push; nothing here is worth caching.
export const dynamic = "force-dynamic";

function hours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function freshness(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

function DatabaseError({ detail }: { detail: string }) {
  return (
    <main>
      <header className="top">
        <h1>Attendance</h1>
      </header>
      <div className="card">
        <div className="empty">
          <p className="error">Cannot reach the database.</p>
          <p style={{ marginTop: ".75rem" }}>{detail}</p>
          {!looksPooled(process.env.DATABASE_URL) && (
            <p style={{ marginTop: ".75rem" }}>
              DATABASE_URL does not look like Supabase&rsquo;s pooled connection
              string. It needs to contain <code>pooler.</code> and port{" "}
              <code>6543</code> — the direct connection is not reachable from Vercel.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) redirect("/login");

  const { season: requested } = await searchParams;

  // Read sequentially, not with Promise.all. More concurrent queries than
  // pooled connections makes postgres.js pipeline them onto one connection,
  // which the transaction pooler deadlocks on.
  let all: Season[];
  let totals: MemberTotal[];
  let sync: SyncInfo | null;
  let selected = "";
  let unknownSeason = false;
  try {
    all = await withTimeout(seasons());
    // An unknown ?season= falls back to the newest rather than showing nothing.
    const known = requested && all.some((s) => s.name === requested) ? requested : undefined;
    const current = known ?? all[0]?.name;

    totals = current ? await withTimeout(memberTotals(current)) : [];
    sync = current ? await withTimeout(lastSyncFor(current)) : null;

    selected = current ?? "";
    unknownSeason = Boolean(requested && !known);
  } catch (e) {
    return <DatabaseError detail={e instanceof Error ? e.message : String(e)} />;
  }

  const totalMinutes = totals.reduce((sum, t) => sum + t.minutes, 0);

  return (
    <main>
      <header className="top">
        <h1>Attendance</h1>
        <form action="/api/auth/logout" method="post">
          <button className="link" type="submit">Sign out</button>
        </form>
      </header>

      <p className="sub">
        {all.length === 0
          ? "No data has been pushed from the kiosk yet."
          : sync
            ? `${selected} · synced ${freshness(sync.received_at)} · ${sync.record_count} records`
            : `${selected} · not yet pushed`}
      </p>

      {all.length > 0 && (
        <div className="controls">
          <SeasonPicker seasons={all.map((s) => s.name)} current={selected} />
          {all.length === 1 && (
            <span className="hint">
              Other seasons appear here once pushed from the kiosk.
            </span>
          )}
        </div>
      )}

      {unknownSeason && (
        <p className="error">
          That season has not been pushed to the cloud yet — showing {selected} instead.
        </p>
      )}

      <div className="card">
        {totals.length === 0 ? (
          <p className="empty">
            {all.length === 0
              ? "Waiting for the first push from the kiosk."
              : `No completed attendance in ${selected} yet.`}
          </p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Grade</th>
                  <th>Subteam</th>
                  <th className="num">Sessions</th>
                  <th className="num">Hours</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.student_id}>
                    <td className="name">{t.label}</td>
                    <td className="dim">{t.grade ?? "—"}</td>
                    <td className="dim">{t.subteam ?? "—"}</td>
                    <td className="num">{t.sessions}</td>
                    <td className="num">{hours(t.minutes)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>{totals.length} members</th>
                  <th className="num"></th>
                  <th className="num">{hours(totalMinutes)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
