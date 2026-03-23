import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure, adminProcedure } from './init'
import { db } from '#/db'
import { announcements, adminAuditLog } from '#/db/schema'

function auditLog(adminUserId: string, action: string, targetId: string, metadata?: Record<string, unknown>) {
  return db.insert(adminAuditLog).values({
    id: crypto.randomUUID(),
    adminUserId,
    action,
    targetUserId: null,
    metadata: { announcementId: targetId, ...metadata },
    createdAt: new Date(),
  })
}

export const announcementsRouter = createTRPCRouter({
  /** Public: get published announcements (pinned first, then newest). */
  getPublished: publicProcedure.query(async () => {
    return db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        isPinned: announcements.isPinned,
        publishedAt: announcements.publishedAt,
      })
      .from(announcements)
      .where(eq(announcements.isPublished, true))
      .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt))
      .limit(20)
  }),

  /** Admin: list all announcements (including drafts). */
  list: adminProcedure.query(async () => {
    return db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.isPinned), desc(announcements.createdAt))
  }),

  /** Admin: create a new announcement (draft by default). */
  create: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID()
      await db.insert(announcements).values({
        id,
        title: input.title,
        body: input.body,
        authorUserId: ctx.session.user.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      await auditLog(ctx.session.user.id, 'announcement_created', id, { title: input.title })
      return { id }
    }),

  /** Admin: update title/body. */
  update: adminProcedure
    .input(z.object({
      id: z.string(),
      title: z.string().min(1).max(200),
      body: z.string().min(1).max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(announcements)
        .set({ title: input.title, body: input.body, updatedAt: new Date() })
        .where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_updated', input.id)
    }),

  /** Admin: publish. */
  publish: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(announcements)
        .set({ isPublished: true, publishedAt: new Date(), updatedAt: new Date() })
        .where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_published', input.id)
    }),

  /** Admin: unpublish. */
  unpublish: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(announcements)
        .set({ isPublished: false, updatedAt: new Date() })
        .where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_unpublished', input.id)
    }),

  /** Admin: pin. */
  pin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(announcements)
        .set({ isPinned: true, updatedAt: new Date() })
        .where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_pinned', input.id)
    }),

  /** Admin: unpin. */
  unpin: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(announcements)
        .set({ isPinned: false, updatedAt: new Date() })
        .where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_unpinned', input.id)
    }),

  /** Admin: delete. */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db.delete(announcements).where(eq(announcements.id, input.id))
      await auditLog(ctx.session.user.id, 'announcement_deleted', input.id)
    }),
})
