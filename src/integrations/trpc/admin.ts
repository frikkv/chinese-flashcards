import { z } from 'zod'
import { sql, count, desc, eq, gte } from 'drizzle-orm'
import { createTRPCRouter, adminProcedure } from './init'
import { db } from '#/db'
import {
  users,
  userProfiles,
  studySessions,
  chatMessages,
  customWordSets,
  friendships,
  feedback,
} from '#/db/schema'

export const adminRouter = createTRPCRouter({
  /** Check if current user is admin (used by frontend route guards). */
  checkAccess: adminProcedure.query(() => ({ isAdmin: true })),

  /** Aggregate platform statistics for the overview dashboard. */
  getOverviewStats: adminProcedure.query(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)

    const [
      totalUsersRows,
      newUsersRows,
      activeUsersRows,
      totalSessionsRows,
      recentSessionsRows,
      totalChatRows,
      totalWordSetsRows,
      totalFriendshipsRows,
      totalFeedbackRows,
    ] = await Promise.all([
      db.select({ c: count() }).from(users),
      db.select({ c: count() }).from(users).where(gte(users.createdAt, weekAgo)),
      db
        .select({ c: sql<string>`count(distinct ${studySessions.userId})` })
        .from(studySessions)
        .where(gte(studySessions.completedAt, weekAgo)),
      db.select({ c: count() }).from(studySessions),
      db.select({ c: count() }).from(studySessions).where(gte(studySessions.completedAt, weekAgo)),
      db.select({ c: count() }).from(chatMessages),
      db.select({ c: count() }).from(customWordSets),
      db.select({ c: count() }).from(friendships).where(eq(friendships.status, 'accepted')),
      db.select({ c: count() }).from(feedback),
    ])

    return {
      totalUsers: totalUsersRows[0]?.c ?? 0,
      newUsersThisWeek: newUsersRows[0]?.c ?? 0,
      activeUsersThisWeek: parseInt(activeUsersRows[0]?.c ?? '0'),
      totalStudySessions: totalSessionsRows[0]?.c ?? 0,
      studySessionsThisWeek: recentSessionsRows[0]?.c ?? 0,
      totalChatMessages: totalChatRows[0]?.c ?? 0,
      totalCustomWordSets: totalWordSetsRows[0]?.c ?? 0,
      totalFriendships: totalFriendshipsRows[0]?.c ?? 0,
      totalFeedback: totalFeedbackRows[0]?.c ?? 0,
    }
  }),

  /** Paginated list of all users with profile info. */
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input }) => {
      const [rows, totalRows] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            createdAt: users.createdAt,
            username: userProfiles.username,
            displayName: userProfiles.displayName,
            role: userProfiles.role,
          })
          .from(users)
          .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
          .orderBy(desc(users.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ c: count() }).from(users),
      ])

      return {
        users: rows,
        total: totalRows[0]?.c ?? 0,
      }
    }),
})
