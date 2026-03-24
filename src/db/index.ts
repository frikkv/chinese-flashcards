import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

// Use DATABASE_URL (Supabase pooler) for all connections.
// DIRECT_URL is available as a fallback if the pooler is unavailable.
// Strip ?pgbouncer=true — node-postgres doesn't recognize it and it can
// interfere with auth on some Supabase pooler configurations.
const rawUrl = process.env.DATABASE_URL ?? process.env.DIRECT_URL ?? ''
const connStr = rawUrl.replace(/[?&]pgbouncer=true/, '')
const pool = new Pool({
  connectionString: connStr || undefined,
  max: 1,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
  ssl: { rejectUnauthorized: false },
})

export const db = drizzle({ client: pool, schema })
