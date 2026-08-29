import postgres from "postgres";

/**
 * Supabase connection for serverless.
 *
 * `prepare: false` is required: the transaction pooler (port 6543) multiplexes
 * connections and cannot carry server-side prepared statements across them.
 * `max: 1` keeps each short-lived function instance to a single connection.
 */
const globalForDb = global as typeof globalThis & { _sql?: postgres.Sql };

function connect(): postgres.Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  return postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

export function db(): postgres.Sql {
  if (!globalForDb._sql) globalForDb._sql = connect();
  return globalForDb._sql;
}
