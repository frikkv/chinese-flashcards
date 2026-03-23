import { db } from '#/db'
import { analyticsEvents } from '#/db/schema'

export function logEvent(opts: {
  userId?: string | null
  eventName: string
  properties?: Record<string, unknown> | null
}) {
  // Fire-and-forget: never block the main request
  void db
    .insert(analyticsEvents)
    .values({
      id: crypto.randomUUID(),
      userId: opts.userId ?? null,
      eventName: opts.eventName,
      properties: opts.properties ?? null,
      createdAt: new Date(),
    })
    .catch((err) => {
      console.error('[analytics] Failed to log event:', opts.eventName, err)
    })
}
