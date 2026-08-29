import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { memberTotals, seasons, lastSync } from "@/lib/report";
import { looksPooled } from "@/lib/db";
import SeasonPicker from "./SeasonPicker";

// Always reflects the latest push; nothing here is worth caching.
export const dynamic = "force-dynamic";

function hours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function freshness(iso: string) {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token || !(await verifyToken(token))) redirect("/login");

  const { season } = await searchParams;

  // A database that cannot be reached must say so. Left unhandled, the queries
  // hang until the platform kills the request and the visitor sees a blank
  // page with no indication of what went wrong.
  let all, totals, sync;
  try {
    [all, totals, sync] = await Promise.all([
      seasons(),
      memberTotals(season),
      lastSync(),
    ]);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
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
                <code>6543</code> — the direct connection is not reachable from
                Vercel.
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  const current = season ?? all[0]?.name ?? "";
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
        {sync ? (
          <>
            Synced from the kiosk {freshness(sync.received_at)} · {sync.record_count} records
          </>
        ) : (
          "No data has been pushed from the kiosk yet."
        )}
      </p>

      {all.length > 1 && (
        <div className="controls">
          <SeasonPicker seasons={all.map((s) => s.name)} current={current} />
        </div>
      )}

      <div className="card">
        {totals.length === 0 ? (
          <p className="empty">
            {sync ? "No completed attendance in this season yet." : "Waiting for the first push."}
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
