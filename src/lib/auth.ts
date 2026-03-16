import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '#/db/index'

const trustedOrigins = process.env.BETTER_AUTH_URL
  ? [process.env.BETTER_AUTH_URL]
  : []

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    usePlural: true,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    // Cache session data in a signed cookie for up to 5 minutes so
    // auth.api.getSession() can validate without a DB round-trip on
    // every tRPC request.
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes
    },
  },
  trustedOrigins,
  plugins: [tanstackStartCookies()],
})
