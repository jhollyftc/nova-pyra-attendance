import postgres from "postgres";

/**
 * Supabase connection for serverless.
 *
 * `prepare: false` is required: the transaction pooler (port 6543) multiplexes
 * connections and cannot carry server-side prepared statements across them.
 * `max: 1` keeps each short-lived function instance to a single connection.
 *
 * The timeouts matter more than they look. An unreachable database — a paused
 * Supabase project, or the IPv6-only direct connection string, which Vercel
 * cannot route to — does not refuse the connection, it swallows it. Without a
 * ceiling the page hangs until the platform kills it and the visitor sees
 * nothing at all.
 */
const globalForDb = global as typeof globalThis & { _sql?: postgres.Sql };

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return postgres(url, {
    prepare: false,
    max: 3,
    idle_timeout: 20,
    connect_timeout: 8,
    // Supabase terminates TLS at the pooler. Without this the password
    // crosses the public internet in the clear.
    ssl: "require",
  });
}

export function db(): postgres.Sql {
  if (!globalForDb._sql) globalForDb._sql = connect();
  return globalForDb._sql;
}

/** True when the string is the pooled connection Vercel needs, not the direct one. */
export function looksPooled(url: string | undefined): boolean {
  return Boolean(url && url.includes("pooler.") && url.includes(":6543"));
}

/**
 * Fails a query that never settles.
 *
 * postgres.js's own connect_timeout did not fire against a stalled socket in
 * production, so the page hung until the platform killed it. This is a ceiling
 * this app controls, set below the platform's request limit so the failure is
 * ours to report rather than a blank page.
 */
export function withTimeout<T>(work: Promise<T>, ms = 8000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms waiting for the database.`)),
      ms
    );
  });
  return Promise.race([work, guard]).finally(() => clearTimeout(timer)) as Promise<T>;
}
