import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

// Explicit Pool config for Vercel serverless.
//
// allowExitOnIdle: true  — CRITICAL. Without this, pg keeps the event loop
//   alive via idle connections so the Vercel function never exits after sending
//   a response, causing every request to appear to "hang" until the 30s timeout.
//
// connectionTimeoutMillis: 5000 — fail fast if the DB is unreachable (e.g. a
//   malformed / quoted DATABASE_URL) instead of hanging indefinitely.
//
// idleTimeoutMillis: 0 — release idle connections immediately; serverless
//   invocations are short-lived so there's no benefit in keeping them open.
//
// max: 2 — keep the connection count low per invocation; the Supabase
//   connection pooler (PgBouncer) handles multiplexing at the infra level.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 0,
  allowExitOnIdle: true,
})

pool.on('error', (err) => {
  console.error('[db] idle client error:', err.message)
})

export const db = drizzle({ client: pool, schema })
