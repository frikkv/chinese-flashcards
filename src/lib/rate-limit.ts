/**
 * In-memory rate limiter for serverless environments.
 * Best-effort: state resets on cold starts, which is acceptable for soft
 * limits where the goal is abuse prevention rather than hard enforcement.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 20 })
 *   if (!limiter.check(userId)) throw new TRPCError({ code: 'TOO_MANY_REQUESTS' })
 */
export function createRateLimiter(opts: { windowMs: number; max: number }) {
  const map = new Map<string, number[]>()
  return {
    check(key: string): boolean {
      const now = Date.now()
      const prev = (map.get(key) ?? []).filter((t) => now - t < opts.windowMs)
      if (prev.length >= opts.max) return false
      map.set(key, [...prev, now])
      return true
    },
  }
}
