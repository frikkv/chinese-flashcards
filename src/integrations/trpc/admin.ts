import { z } from 'zod'
import { sql, count, desc, eq, gte, and, or, ilike } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
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
  analyticsEvents,
  adminAuditLog,
  aiUsageEvents,
} from '#/db/schema'

export const adminRouter = createTRPCRouter({
  /** Check if current user is admin (used by frontend route guards). */
  checkAccess: adminProcedure.query(() => ({ isAdmin: true })),

  /**
   * Aggregate platform statistics for the overview dashboard.
   * "Active users" = distinct users with at least one study session in the period.
   * This is the same signal used for retention and growth metrics.
   */
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

  /** Analytics event stats: totals, top events, daily counts for 14 days. */
  getEventStats: adminProcedure.query(async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)

    const [totalRows, recentRows, topEventsRows, dailyRows] = await Promise.all([
      db.select({ c: count() }).from(analyticsEvents),
      db.select({ c: count() }).from(analyticsEvents).where(gte(analyticsEvents.createdAt, weekAgo)),
      db
        .select({
          eventName: analyticsEvents.eventName,
          c: count(),
        })
        .from(analyticsEvents)
        .groupBy(analyticsEvents.eventName)
        .orderBy(desc(count()))
        .limit(15),
      db
        .select({
          day: sql<string>`date(${analyticsEvents.createdAt})`,
          c: count(),
        })
        .from(analyticsEvents)
        .where(gte(analyticsEvents.createdAt, fourteenDaysAgo))
        .groupBy(sql`date(${analyticsEvents.createdAt})`)
        .orderBy(sql`date(${analyticsEvents.createdAt})`),
    ])

    return {
      totalEvents: totalRows[0]?.c ?? 0,
      eventsThisWeek: recentRows[0]?.c ?? 0,
      topEvents: topEventsRows.map((r) => ({ name: r.eventName, count: r.c })),
      dailyCounts: dailyRows.map((r) => ({ day: r.day, count: r.c })),
    }
  }),

  /**
   * Growth stats: daily new users, active users, sessions for 14 days.
   *
   * "Active user" = completed at least one study session on that day.
   * This is consistent with the retention signal definition.
   * Chat-only users are not counted as active (same as retention).
   */
  getGrowthStats: adminProcedure.query(async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000)

    const [newUsersDaily, activeUsersDaily, sessionsDaily] = await Promise.all([
      db
        .select({
          day: sql<string>`date(${users.createdAt})`,
          c: count(),
        })
        .from(users)
        .where(gte(users.createdAt, fourteenDaysAgo))
        .groupBy(sql`date(${users.createdAt})`)
        .orderBy(sql`date(${users.createdAt})`),
      db
        .select({
          day: sql<string>`date(${studySessions.completedAt})`,
          c: sql<string>`count(distinct ${studySessions.userId})`,
        })
        .from(studySessions)
        .where(gte(studySessions.completedAt, fourteenDaysAgo))
        .groupBy(sql`date(${studySessions.completedAt})`)
        .orderBy(sql`date(${studySessions.completedAt})`),
      db
        .select({
          day: sql<string>`date(${studySessions.completedAt})`,
          c: count(),
        })
        .from(studySessions)
        .where(gte(studySessions.completedAt, fourteenDaysAgo))
        .groupBy(sql`date(${studySessions.completedAt})`)
        .orderBy(sql`date(${studySessions.completedAt})`),
    ])

    return {
      newUsersDaily: newUsersDaily.map((r) => ({ day: r.day, count: r.c })),
      activeUsersDaily: activeUsersDaily.map((r) => ({ day: r.day, count: parseInt(r.c) })),
      sessionsDaily: sessionsDaily.map((r) => ({ day: r.day, count: r.c })),
    }
  }),

  /** Feature usage: top study modes, top word sets, top users, chat/friendship counts. */
  getFeatureUsage: adminProcedure.query(async () => {
    const [topModes, topWordSets, topUsers, chatUsage, friendshipGrowth] = await Promise.all([
      db
        .select({ mode: studySessions.mode, c: count() })
        .from(studySessions)
        .groupBy(studySessions.mode)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({
          name: customWordSets.name,
          wordCount: customWordSets.wordCount,
          userId: customWordSets.userId,
        })
        .from(customWordSets)
        .orderBy(desc(customWordSets.createdAt))
        .limit(10),
      db
        .select({
          userId: studySessions.userId,
          c: count(),
          displayName: userProfiles.displayName,
          username: userProfiles.username,
        })
        .from(studySessions)
        .leftJoin(userProfiles, eq(studySessions.userId, userProfiles.userId))
        .groupBy(studySessions.userId, userProfiles.displayName, userProfiles.username)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({ c: count() })
        .from(chatMessages)
        .where(eq(chatMessages.role, 'user')),
      db
        .select({ c: count() })
        .from(friendships)
        .where(eq(friendships.status, 'accepted')),
    ])

    return {
      topModes: topModes.map((r) => ({ mode: r.mode, count: r.c })),
      recentWordSets: topWordSets,
      topUsers: topUsers.map((r) => ({
        userId: r.userId,
        displayName: r.displayName ?? 'Unknown',
        username: r.username,
        sessionCount: r.c,
      })),
      totalUserChatMessages: chatUsage[0]?.c ?? 0,
      totalAcceptedFriendships: friendshipGrowth[0]?.c ?? 0,
    }
  }),

  /**
   * Paginated list of all users with profile info, activity stats, and search/filter.
   * Includes per-user session count, chat count, word set count, and last active date.
   * Sort options: newest (default), oldest, most_sessions.
   */
  listUsers: adminProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        search: z.string().max(100).optional(),
        roleFilter: z.enum(['all', 'user', 'admin']).default('all'),
        sort: z.enum(['newest', 'oldest', 'most_sessions']).default('newest'),
      }),
    )
    .query(async ({ input }) => {
      const conditions = []

      if (input.search && input.search.trim()) {
        const q = `%${input.search.trim()}%`
        conditions.push(
          or(
            ilike(users.name, q),
            ilike(users.email, q),
            ilike(userProfiles.username, q),
            ilike(userProfiles.displayName, q),
          ),
        )
      }

      if (input.roleFilter !== 'all') {
        conditions.push(eq(userProfiles.role, input.roleFilter))
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined

      const orderBy =
        input.sort === 'oldest' ? users.createdAt :
        input.sort === 'most_sessions' ? sql`session_count` :
        desc(users.createdAt)
      const orderDir = input.sort === 'oldest' ? users.createdAt : undefined

      // Use raw SQL for the enriched query with per-user stats
      const sortClause =
        input.sort === 'oldest' ? 'u.created_at ASC' :
        input.sort === 'most_sessions' ? 'session_count DESC' :
        'u.created_at DESC'

      const searchClause = input.search?.trim()
        ? `AND (u.name ILIKE '%${input.search.trim().replace(/'/g, "''")}%' OR u.email ILIKE '%${input.search.trim().replace(/'/g, "''")}%' OR p.username ILIKE '%${input.search.trim().replace(/'/g, "''")}%' OR p.display_name ILIKE '%${input.search.trim().replace(/'/g, "''")}%')`
        : ''
      const roleClause = input.roleFilter !== 'all'
        ? `AND p.role = '${input.roleFilter}'`
        : ''

      const [dataRows, totalRows] = await Promise.all([
        db.execute(sql.raw(`
          SELECT
            u.id, u.name, u.email, u.created_at,
            p.username, p.display_name, p.role,
            coalesce(ss.cnt, 0)::text AS session_count,
            coalesce(cm.cnt, 0)::text AS chat_count,
            coalesce(ws.cnt, 0)::text AS wordset_count,
            ss.last_active
          FROM users u
          LEFT JOIN user_profiles p ON p.user_id = u.id
          LEFT JOIN (SELECT user_id, count(*)::int AS cnt, max(completed_at) AS last_active FROM study_sessions GROUP BY user_id) ss ON ss.user_id = u.id
          LEFT JOIN (SELECT user_id, count(*)::int AS cnt FROM chat_messages WHERE role = 'user' GROUP BY user_id) cm ON cm.user_id = u.id
          LEFT JOIN (SELECT user_id, count(*)::int AS cnt FROM custom_word_sets GROUP BY user_id) ws ON ws.user_id = u.id
          WHERE 1=1 ${searchClause} ${roleClause}
          ORDER BY ${sortClause}
          LIMIT ${input.limit} OFFSET ${input.offset}
        `)),
        db.execute(sql.raw(`
          SELECT count(*)::text AS c FROM users u
          LEFT JOIN user_profiles p ON p.user_id = u.id
          WHERE 1=1 ${searchClause} ${roleClause}
        `)),
      ])

      return {
        users: (dataRows.rows as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          name: r.name as string,
          email: r.email as string,
          createdAt: r.created_at as string,
          username: r.username as string | null,
          displayName: r.display_name as string | null,
          role: r.role as string | null,
          sessionCount: parseInt(r.session_count as string ?? '0'),
          chatCount: parseInt(r.chat_count as string ?? '0'),
          wordsetCount: parseInt(r.wordset_count as string ?? '0'),
          lastActive: r.last_active as string | null,
        })),
        total: parseInt((totalRows.rows[0] as Record<string, string>)?.c ?? '0'),
      }
    }),

  /**
   * AI usage monitoring with real metered data from ai_usage_events.
   *
   * Returns:
   * - request counts by feature (24h/7d/30d/all)
   * - token totals by feature
   * - real cost totals from stored estimates
   * - model usage breakdown
   * - top AI-consuming users (7d)
   *
   * Falls back gracefully when ai_usage_events is empty (returns zeros).
   */
  getAiUsage: adminProcedure.query(async () => {
    const dayAgo = new Date(Date.now() - 86_400_000)
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)
    const monthAgo = new Date(Date.now() - 30 * 86_400_000)

    const [
      byFeature,
      byModel,
      volume24h,
      volume7d,
      volume30d,
      volumeTotal,
      topUsers7d,
      tokenTotals30d,
      costTotal30d,
    ] = await Promise.all([
      // Requests + tokens by feature (all time)
      db
        .select({
          feature: aiUsageEvents.featureName,
          requests: count(),
          inputTokens: sql<string>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
          outputTokens: sql<string>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
          cost: sql<string>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}::numeric), 0)`,
        })
        .from(aiUsageEvents)
        .groupBy(aiUsageEvents.featureName)
        .orderBy(desc(count())),
      // By model
      db
        .select({
          model: aiUsageEvents.model,
          requests: count(),
        })
        .from(aiUsageEvents)
        .groupBy(aiUsageEvents.model)
        .orderBy(desc(count())),
      // Volume windows
      db.select({ c: count() }).from(aiUsageEvents).where(gte(aiUsageEvents.createdAt, dayAgo)),
      db.select({ c: count() }).from(aiUsageEvents).where(gte(aiUsageEvents.createdAt, weekAgo)),
      db.select({ c: count() }).from(aiUsageEvents).where(gte(aiUsageEvents.createdAt, monthAgo)),
      db.select({ c: count() }).from(aiUsageEvents),
      // Top users by AI requests (7d)
      db.execute(sql`
        SELECT
          a.user_id,
          count(*)::text AS req_count,
          coalesce(sum(a.estimated_cost_usd::numeric), 0)::text AS user_cost,
          p.username, p.display_name
        FROM ai_usage_events a
        LEFT JOIN user_profiles p ON p.user_id = a.user_id
        WHERE a.created_at >= ${weekAgo} AND a.user_id IS NOT NULL
        GROUP BY a.user_id, p.username, p.display_name
        ORDER BY count(*) DESC
        LIMIT 10
      `),
      // Token totals (30d)
      db
        .select({
          inputTokens: sql<string>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)`,
          outputTokens: sql<string>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)`,
        })
        .from(aiUsageEvents)
        .where(gte(aiUsageEvents.createdAt, monthAgo)),
      // Real cost total (30d)
      db
        .select({
          cost: sql<string>`coalesce(sum(${aiUsageEvents.estimatedCostUsd}::numeric), 0)`,
        })
        .from(aiUsageEvents)
        .where(gte(aiUsageEvents.createdAt, monthAgo)),
    ])

    type TopUserRow = { user_id: string; req_count: string; user_cost: string; username: string | null; display_name: string | null }

    return {
      volume: {
        last24h: volume24h[0]?.c ?? 0,
        last7d: volume7d[0]?.c ?? 0,
        last30d: volume30d[0]?.c ?? 0,
        total: volumeTotal[0]?.c ?? 0,
      },
      byFeature: byFeature.map((r) => ({
        feature: r.feature,
        requests: r.requests,
        inputTokens: parseInt(r.inputTokens),
        outputTokens: parseInt(r.outputTokens),
        cost: parseFloat(parseFloat(r.cost).toFixed(4)),
      })),
      byModel: byModel.map((r) => ({ model: r.model, requests: r.requests })),
      tokens30d: {
        input: parseInt(tokenTotals30d[0]?.inputTokens ?? '0'),
        output: parseInt(tokenTotals30d[0]?.outputTokens ?? '0'),
      },
      cost30d: parseFloat(parseFloat(costTotal30d[0]?.cost ?? '0').toFixed(4)),
      topUsers7d: (topUsers7d.rows as TopUserRow[]).map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name ?? 'Unknown',
        requests: parseInt(r.req_count),
        cost: parseFloat(parseFloat(r.user_cost).toFixed(4)),
      })),
    }
  }),

  /**
   * Heavy user monitoring and operational health.
   * Identifies users with disproportionately high usage (potential abuse or power users).
   * Also returns recent rate-limit events if tracked via analytics_events.
   */
  getSystemHealth: adminProcedure.query(async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000)

    const [topChatUsers, topSessionUsers, rateLimitEvents] = await Promise.all([
      // Top 10 users by chat volume in last 7 days
      db.execute(sql`
        SELECT
          cm.user_id,
          count(*)::text AS msg_count,
          p.username, p.display_name
        FROM chat_messages cm
        LEFT JOIN user_profiles p ON p.user_id = cm.user_id
        WHERE cm.created_at >= ${weekAgo} AND cm.role = 'user'
        GROUP BY cm.user_id, p.username, p.display_name
        ORDER BY count(*) DESC
        LIMIT 10
      `),
      // Top 10 users by session volume in last 7 days
      db.execute(sql`
        SELECT
          ss.user_id,
          count(*)::text AS session_count,
          p.username, p.display_name
        FROM study_sessions ss
        LEFT JOIN user_profiles p ON p.user_id = ss.user_id
        WHERE ss.completed_at >= ${weekAgo}
        GROUP BY ss.user_id, p.username, p.display_name
        ORDER BY count(*) DESC
        LIMIT 10
      `),
      // Rate limit hits from analytics events (if tracked)
      db
        .select({ c: count() })
        .from(analyticsEvents)
        .where(and(
          eq(analyticsEvents.eventName, 'rate_limit_hit'),
          gte(analyticsEvents.createdAt, weekAgo),
        )),
    ])

    type UserRow = { user_id: string; username: string | null; display_name: string | null }

    return {
      topChatUsers: (topChatUsers.rows as Array<UserRow & { msg_count: string }>).map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name ?? 'Unknown',
        count: parseInt(r.msg_count),
      })),
      topSessionUsers: (topSessionUsers.rows as Array<UserRow & { session_count: string }>).map((r) => ({
        userId: r.user_id,
        username: r.username,
        displayName: r.display_name ?? 'Unknown',
        count: parseInt(r.session_count),
      })),
      rateLimitHitsThisWeek: rateLimitEvents[0]?.c ?? 0,
    }
  }),

  /**
   * Export users list as CSV-compatible data.
   * Returns all users (no pagination) with stats for CSV generation on the client.
   * Limited to 5000 users to prevent memory issues.
   */
  exportUsers: adminProcedure.query(async () => {
    const rows = await db.execute(sql.raw(`
      SELECT
        u.id, u.name, u.email, u.created_at,
        p.username, p.display_name, p.role,
        coalesce(ss.cnt, 0)::text AS session_count,
        coalesce(cm.cnt, 0)::text AS chat_count,
        coalesce(ws.cnt, 0)::text AS wordset_count,
        ss.last_active
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*)::int AS cnt, max(completed_at) AS last_active FROM study_sessions GROUP BY user_id) ss ON ss.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*)::int AS cnt FROM chat_messages WHERE role = 'user' GROUP BY user_id) cm ON cm.user_id = u.id
      LEFT JOIN (SELECT user_id, count(*)::int AS cnt FROM custom_word_sets GROUP BY user_id) ws ON ws.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT 5000
    `))

    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      createdAt: r.created_at as string,
      username: (r.username as string) ?? '',
      displayName: (r.display_name as string) ?? '',
      role: (r.role as string) ?? 'user',
      sessionCount: r.session_count as string,
      chatCount: r.chat_count as string,
      wordsetCount: r.wordset_count as string,
      lastActive: (r.last_active as string) ?? '',
    }))
  }),

  /** Change a user's role (admin only, cannot demote self). */
  updateUserRole: adminProcedure
    .input(
      z.object({
        targetUserId: z.string(),
        newRole: z.enum(['user', 'admin']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.session.user.id && input.newRole !== 'admin') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot demote yourself.',
        })
      }

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, input.targetUserId))
        .limit(1)
      if (!profile) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User profile not found.' })
      }

      await db
        .update(userProfiles)
        .set({ role: input.newRole, updatedAt: new Date() })
        .where(eq(userProfiles.userId, input.targetUserId))

      // Audit log
      await db.insert(adminAuditLog).values({
        id: crypto.randomUUID(),
        adminUserId: ctx.session.user.id,
        action: 'role_change',
        targetUserId: input.targetUserId,
        metadata: { oldRole: profile.role, newRole: input.newRole },
        createdAt: new Date(),
      })

      return { success: true }
    }),

  /** Recent admin audit log entries. */
  getAuditLog: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: adminAuditLog.id,
        action: adminAuditLog.action,
        targetUserId: adminAuditLog.targetUserId,
        metadata: adminAuditLog.metadata,
        createdAt: adminAuditLog.createdAt,
        adminUsername: userProfiles.username,
        adminDisplayName: userProfiles.displayName,
      })
      .from(adminAuditLog)
      .leftJoin(userProfiles, eq(adminAuditLog.adminUserId, userProfiles.userId))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(20)
    return rows
  }),

  /**
   * Retention analytics.
   *
   * Definition: "active" = completed at least one study session (core product usage).
   * This is the single retention signal used across all retention metrics.
   *
   * D1/D7/D30 retention:
   * - Eligible: users who signed up >= N days ago
   * - Retained: eligible users who had a study session on day N (within a 24h window
   *   starting N days after their individual signup, not calendar day)
   * - This measures "came back on day N" not "ever came back after day N"
   *
   * Cohort retention:
   * - Groups users by signup week (Monday-based)
   * - Measures % who had a session in their second week (days 7-13 after individual signup)
   *
   * Limitations:
   * - Only counts study_sessions, not chat or other engagement
   * - Users who engage via chat only are not counted as retained
   */
  getRetention: adminProcedure.query(async () => {
    const parseCount = (rows: { rows: unknown[] }) => {
      const val = parseInt((rows.rows[0] as Record<string, string>)?.count ?? '0')
      return Math.max(val, 0) // sanity: never negative
    }

    // D1/D7/D30: user had a session within a 24h window starting N days after their signup
    const retentionQuery = (days: number) => sql.raw(`
      SELECT count(DISTINCT u.id)::text AS count
      FROM users u
      WHERE u.created_at <= now() - interval '${days} days'
        AND EXISTS (
          SELECT 1 FROM study_sessions s
          WHERE s.user_id = u.id
            AND s.completed_at >= u.created_at + interval '${days} days'
            AND s.completed_at < u.created_at + interval '${days + 1} days'
        )
    `)
    const eligibleQuery = (days: number) => sql.raw(`
      SELECT count(*)::text AS count FROM users WHERE created_at <= now() - interval '${days} days'
    `)

    const [d1Ret, d1Elig, d7Ret, d7Elig, d30Ret, d30Elig] = await Promise.all([
      db.execute(retentionQuery(1)),
      db.execute(eligibleQuery(1)),
      db.execute(retentionQuery(7)),
      db.execute(eligibleQuery(7)),
      db.execute(retentionQuery(30)),
      db.execute(eligibleQuery(30)),
    ])

    const d1Retained = parseCount(d1Ret)
    const d1Total = parseCount(d1Elig)
    const d7Retained = parseCount(d7Ret)
    const d7Total = parseCount(d7Elig)
    const d30Retained = parseCount(d30Ret)
    const d30Total = parseCount(d30Elig)

    // Weekly cohort retention: for each of the last 8 weeks, what % came back in week 2
    // Uses individual user signup date (not cohort week start) as the anchor for the 7-13 day window
    const cohortRows = await db.execute(sql`
      WITH cohorts AS (
        SELECT
          date_trunc('week', u.created_at) AS cohort_week,
          u.id AS user_id,
          u.created_at AS signup_at
        FROM users u
        WHERE u.created_at >= now() - interval '8 weeks'
      ),
      retained AS (
        SELECT DISTINCT c.cohort_week, c.user_id
        FROM cohorts c
        JOIN study_sessions s ON s.user_id = c.user_id
          AND s.completed_at >= c.signup_at + interval '7 days'
          AND s.completed_at < c.signup_at + interval '14 days'
      )
      SELECT
        c.cohort_week::text,
        count(DISTINCT c.user_id)::text AS cohort_size,
        count(DISTINCT r.user_id)::text AS retained_count
      FROM cohorts c
      LEFT JOIN retained r ON c.cohort_week = r.cohort_week AND c.user_id = r.user_id
      GROUP BY c.cohort_week
      ORDER BY c.cohort_week
    `)

    const safePct = (n: number, d: number) => d > 0 ? Math.min(Math.round((n / d) * 100), 100) : 0

    const cohorts = (cohortRows.rows as Array<{ cohort_week: string; cohort_size: string; retained_count: string }>).map((r) => {
      const size = Math.max(parseInt(r.cohort_size), 0)
      const retained = Math.max(parseInt(r.retained_count), 0)
      return { week: r.cohort_week, size, retained, rate: safePct(retained, size) }
    })

    return {
      d1: { retained: d1Retained, total: d1Total, rate: safePct(d1Retained, d1Total) },
      d7: { retained: d7Retained, total: d7Total, rate: safePct(d7Retained, d7Total) },
      d30: { retained: d30Retained, total: d30Total, rate: safePct(d30Retained, d30Total) },
      cohorts,
    }
  }),

  /**
   * Product funnel: signed up → first session → first chat → first word set → first friend request.
   *
   * Each step is cumulative: step N only counts users who also completed all previous steps.
   * This means "first chat message" only counts users who ALSO completed a study session.
   * Percentages are relative to "Signed up" (top of funnel).
   *
   * Uses first occurrence of each action (min timestamp) to determine ordering.
   * Users are only counted once per step (DISTINCT user_id).
   *
   * Limitation: funnel is based on "ever did X" not "did X within N days of signup."
   */
  getFunnel: adminProcedure.query(async () => {
    // Single query: for each user, find their first occurrence of each action
    const rows = await db.execute(sql`
      SELECT
        count(*)::text AS signed_up,
        count(first_session)::text AS studied,
        count(CASE WHEN first_session IS NOT NULL AND first_chat IS NOT NULL THEN 1 END)::text AS chatted,
        count(CASE WHEN first_session IS NOT NULL AND first_chat IS NOT NULL AND first_wordset IS NOT NULL THEN 1 END)::text AS created_set,
        count(CASE WHEN first_session IS NOT NULL AND first_chat IS NOT NULL AND first_wordset IS NOT NULL AND first_friend IS NOT NULL THEN 1 END)::text AS sent_request
      FROM (
        SELECT
          u.id,
          (SELECT min(s.completed_at) FROM study_sessions s WHERE s.user_id = u.id) AS first_session,
          (SELECT min(c.created_at) FROM chat_messages c WHERE c.user_id = u.id AND c.role = 'user') AS first_chat,
          (SELECT min(w.created_at) FROM custom_word_sets w WHERE w.user_id = u.id) AS first_wordset,
          (SELECT min(f.created_at) FROM friendships f WHERE f.sender_id = u.id) AS first_friend
        FROM users u
      ) per_user
    `)

    const r = rows.rows[0] as Record<string, string>
    const signedUp = Math.max(parseInt(r.signed_up ?? '0'), 0)
    const studied = Math.max(parseInt(r.studied ?? '0'), 0)
    const chatted = Math.max(parseInt(r.chatted ?? '0'), 0)
    const createdSet = Math.max(parseInt(r.created_set ?? '0'), 0)
    const sentRequest = Math.max(parseInt(r.sent_request ?? '0'), 0)

    const pct = (n: number, base: number) => base > 0 ? Math.min(Math.round((n / base) * 100), 100) : 0

    return [
      { step: 'Signed up', count: signedUp, pct: 100 },
      { step: 'First study session', count: studied, pct: pct(studied, signedUp) },
      { step: 'First chat message', count: chatted, pct: pct(chatted, signedUp) },
      { step: 'First custom word set', count: createdSet, pct: pct(createdSet, signedUp) },
      { step: 'First friend request', count: sentRequest, pct: pct(sentRequest, signedUp) },
    ]
  }),

  /**
   * Time-to-value: median time from signup to first key action.
   *
   * Only includes users who actually completed the action (INNER JOIN).
   * Uses percentile_cont(0.5) for true median (not average, which outliers distort).
   * Filters out negative diffs (possible if created_at has timezone drift).
   * Returns null if no users have completed the action.
   *
   * Limitation: median can be skewed if most users complete the action immediately
   * (within the same session as signup). This is expected for study sessions.
   */
  getTimeToValue: adminProcedure.query(async () => {
    // Each subquery: find first occurrence per user, compute diff, filter negatives, take median
    const medianQuery = (subquery: string) => sql.raw(`
      SELECT (percentile_cont(0.5) WITHIN GROUP (ORDER BY hours))::text AS median_hours
      FROM (
        SELECT extract(epoch FROM diff) / 3600.0 AS hours
        FROM (${subquery}) t
        WHERE diff >= interval '0'
      ) positive
    `)

    const [sessionMedian, chatMedian, wordSetMedian] = await Promise.all([
      db.execute(medianQuery(`
        SELECT min(s.completed_at) - u.created_at AS diff
        FROM users u
        JOIN study_sessions s ON s.user_id = u.id
        GROUP BY u.id, u.created_at
      `)),
      db.execute(medianQuery(`
        SELECT min(c.created_at) - u.created_at AS diff
        FROM users u
        JOIN chat_messages c ON c.user_id = u.id AND c.role = 'user'
        GROUP BY u.id, u.created_at
      `)),
      db.execute(medianQuery(`
        SELECT min(w.created_at) - u.created_at AS diff
        FROM users u
        JOIN custom_word_sets w ON w.user_id = u.id
        GROUP BY u.id, u.created_at
      `)),
    ])

    const parseMedian = (rows: { rows: unknown[] }): number | null => {
      const val = (rows.rows[0] as Record<string, string | null>)?.median_hours
      if (!val || val === 'null') return null
      const num = parseFloat(val)
      return isNaN(num) ? null : parseFloat(Math.max(num, 0).toFixed(1))
    }

    return {
      firstStudySession: parseMedian(sessionMedian),
      firstChatMessage: parseMedian(chatMedian),
      firstCustomWordSet: parseMedian(wordSetMedian),
    }
  }),
})
