import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { eq } from 'drizzle-orm'
import { auth } from '#/lib/auth'
import { db } from '#/db'
import { userProfiles } from '#/db/schema'

export async function createContext({ request }: { request: Request }) {
  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null)
  return { session }
}

type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

// ── Logging middleware ────────────────────────────────────────────
const logger = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const ms = Date.now() - start
  console.log(`[trpc] ${type} ${path} ${result.ok ? 'ok' : 'err'} ${ms}ms`)
  return result
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure.use(logger)

export const protectedProcedure = t.procedure
  .use(logger)
  .use(({ ctx, next }) => {
    if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' })
    return next({ ctx: { ...ctx, session: ctx.session } })
  })

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const [profile] = await db
    .select({ role: userProfiles.role })
    .from(userProfiles)
    .where(eq(userProfiles.userId, ctx.session.user.id))
    .limit(1)
  if (!profile || profile.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required.' })
  }
  return next({ ctx })
})
