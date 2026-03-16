import { betterAuth } from 'better-auth'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { db } from '#/db/index'

const trustedOrigins = process.env.BETTER_AUTH_URL
  ? [process.env.BETTER_AUTH_URL]
  : []

export const auth = betterAuth({
  // baseURL is required on the server so Better Auth can construct absolute
  // URLs for internal operations (e.g. new URL('/api/auth/get-session')).
  // Without it, Node.js throws "TypeError: Invalid URL" on every tRPC request
  // that calls auth.api.getSession(). BETTER_AUTH_URL must be set in the
  // deployment environment (e.g. https://your-app.vercel.app).
  baseURL: process.env.BETTER_AUTH_URL,
  // BETTER_AUTH_SECRET must be set in production env vars.
  // Without it, Better Auth throws "You are using the default secret" in prod.
  secret: process.env.BETTER_AUTH_SECRET,
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
