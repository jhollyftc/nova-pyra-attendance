# Nova Pyra Attendance — cloud mirror

Read-only view of team attendance at `attendance.novapyra.app`, fed by a daily
push from the kiosk. Deployed on Vercel, backed by Supabase Postgres.

The kiosk is the source of truth. Nothing here is ever edited or pushed back.

**No student surnames or PINs are stored here.** Members appear as
`"Evelyn H."` — the form already published on the team website — keyed by the
kiosk's random UUID.

## Deploying

### 1. Supabase

Run [`../supabase/cloud-mirror.sql`](../supabase/cloud-mirror.sql) in the SQL
Editor. Everything lands in a `mirror` schema, so it cannot collide with
anything already in `public`. To start over: `DROP SCHEMA mirror CASCADE;`

Copy the **pooled** connection string (port 6543, not 5432). Serverless
functions open many short-lived connections and will exhaust the direct limit.

### 2. Vercel

Import this GitHub repo, then — this setting is load-bearing:

> **Settings → Build & Deployment → Root Directory = `cloud`**

Left at the repo root, Vercel builds the *kiosk* app and publishes `/kiosk`,
the unauthenticated check-in screen, to the public internet.

To avoid rebuilding on kiosk-only commits, set
**Settings → Git → Ignored Build Step** to:

```sh
git diff --quiet HEAD^ HEAD -- .
```

(Exit 0 means "no changes here", and Vercel skips the build.)

Environment variables — see [`env.example`](env.example):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase pooled string, port 6543 |
| `SYNC_TOKEN` | Must match the kiosk's exactly |
| `APP_PASSWORD_HASH` | bcrypt hash; **not** the kiosk admin password |
| `SESSION_SECRET` | Random string for the login cookie |

Generate a password hash:

```sh
node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" "your-password"
```

### 3. Domain

Settings → Domains → add `attendance.novapyra.app`, then create the CNAME it
shows at your DNS host. TLS is issued automatically.

### 4. Point the kiosk at it

In the kiosk's `.env.local`, then restart it and press **Push Now** on the
admin dashboard:

```
SYNC_URL=https://attendance.novapyra.app/api/sync
SYNC_TOKEN=<same value as Vercel>
```

## How a push is applied

`POST /api/sync` takes a full season snapshot (bearer token, constant-time
compare) and, in one transaction: upserts the season window, members, sessions
and records; deletes anything inside that season's date range the payload no
longer contains; and writes a `sync_log` row.

The deletion is scoped to the pushed season's window. Unscoped, a push of the
current season would wipe every previous season.

Hours count only `checked_out` and `manual_fixed` records, matching the kiosk,
so a total here can never disagree with the same total on the kiosk.
