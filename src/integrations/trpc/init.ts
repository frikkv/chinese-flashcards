import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '#/lib/auth'

export async function createContext({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers })
  return { session }
}

type Context = Awaited<ReturnType<typeof createContext>>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

// ── Logging middleware ────────────────────────────────────────────
// Logs every tRPC call to stdout so Netlify function logs show call
// frequency per procedure. Remove once call patterns are confirmed.
const logger = t.middleware(async ({ path, type, next }) => {
  const start = Date.now()
  const result = await next()
  const ms = Date.now() - start
  console.log(`[trpc] ${type} ${path} ${result.ok ? 'ok' : 'err'} ${ms}ms`)
  return result
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure.use(logger)

export const protectedProcedure = t.procedure.use(logger).use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, session: ctx.session } })
})
