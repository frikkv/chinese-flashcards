import { z } from 'zod'
import { eq, desc, and, sql, count, inArray } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from './init'
import { db } from '#/db'
import { announcements, announcementReads, adminAuditLog } from '#/db/schema'

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

  /** Protected: published announcements with per-user read state. */
  getPublishedWithReadState: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select({
        id: announcements.id,
        title: announcements.title,
        body: announcements.body,
        isPinned: announcements.isPinned,
        publishedAt: announcements.publishedAt,
        readAt: announcementReads.readAt,
      })
      .from(announcements)
      .leftJoin(
        announcementReads,
        and(
          eq(announcementReads.announcementId, announcements.id),
          eq(announcementReads.userId, userId),
        ),
      )
      .where(eq(announcements.isPublished, true))
      .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt))
      .limit(20)

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      isPinned: r.isPinned,
      publishedAt: r.publishedAt,
      isRead: r.readAt !== null,
    }))
  }),

  /** Protected: count of unread published announcements for the current user. */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db.execute(sql`
      SELECT count(*)::text AS c
      FROM announcements a
      WHERE a.is_published = true
        AND NOT EXISTS (
          SELECT 1 FROM announcement_reads r
          WHERE r.announcement_id = a.id AND r.user_id = ${userId}
        )
    `)
    return Math.max(parseInt((rows.rows[0] as Record<string, string>)?.c ?? '0'), 0)
  }),

  /** Protected: mark a single announcement as read. */
  markAsRead: protectedProcedure
    .input(z.object({ announcementId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db
        .insert(announcementReads)
        .values({
          id: crypto.randomUUID(),
          announcementId: input.announcementId,
          userId,
          readAt: new Date(),
        })
        .onConflictDoNothing()
    }),

  /** Protected: mark all published announcements as read. */
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const published = await db
      .select({ id: announcements.id })
      .from(announcements)
      .where(eq(announcements.isPublished, true))

    if (published.length === 0) return

    await Promise.all(
      published.map((a) =>
        db
          .insert(announcementReads)
          .values({
            id: crypto.randomUUID(),
            announcementId: a.id,
            userId,
            readAt: new Date(),
          })
          .onConflictDoNothing(),
      ),
    )
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
