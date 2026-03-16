import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '#/lib/auth'

export async function createContext({ request }: { request: Request }) {
  const t0 = Date.now()
  console.log('[trpc] createContext: start')

  // Race auth.api.getSession against an 8-second timeout.
  // If the DB is unreachable (malformed URL, Supabase pooler down, etc.)
  // we resolve to null (unauthenticated) rather than hanging the function.
  const timeoutPromise = new Promise<null>((resolve) =>
    setTimeout(() => {
      console.error(`[trpc] createContext: getSession timed out after 8s — returning null session`)
      resolve(null)
    }, 8000),
  )

  const session = await Promise.race([
    auth.api
      .getSession({ headers: request.headers })
      .then((s) => {
        console.log(`[trpc] createContext: getSession ok in ${Date.now() - t0}ms, user=${s?.user?.id ?? 'none'}`)
        return s
      })
      .catch((e: unknown) => {
        console.error(`[trpc] createContext: getSession threw in ${Date.now() - t0}ms:`, e)
        return null
      }),
    timeoutPromise,
  ])

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

export const protectedProcedure = t.procedure.use(logger).use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: 'UNAUTHORIZED' })
  return next({ ctx: { ...ctx, session: ctx.session } })
})
