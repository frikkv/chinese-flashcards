import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'

import * as schema from './schema.ts'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: true,
})

export const db = drizzle({ client: pool, schema })
