import { z } from 'zod'
import { eq, desc, sql } from 'drizzle-orm'
import { createTRPCRouter, protectedProcedure } from './init'
import { db } from '#/db'
import { flashcardProgress, studySessions, userLastSession, accounts } from '#/db/schema'

export const progressRouter = createTRPCRouter({
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const [cards, lastSessionRows, recentSessionRows, sessionDates] = await Promise.all([
      db
        .select()
        .from(flashcardProgress)
        .where(eq(flashcardProgress.userId, userId)),
      // Single-row-per-user table: the authoritative "last session" for restoration
      db
        .select()
        .from(userLastSession)
        .where(eq(userLastSession.userId, userId))
        .limit(1),
      // Most recent completed session for the "X/Y correct" hint
      db
        .select()
        .from(studySessions)
        .where(eq(studySessions.userId, userId))
        .orderBy(desc(studySessions.completedAt))
        .limit(1),
      // Session dates for streak calculation (last 90 days)
      db
        .select({ completedAt: studySessions.completedAt })
        .from(studySessions)
        .where(eq(studySessions.userId, userId))
        .orderBy(desc(studySessions.completedAt))
        .limit(90),
    ])

    // Compute study streak
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    const todayTs = todayMidnight.getTime()
    const dateTsSet = new Set(
      sessionDates.map((s) => {
        const d = new Date(s.completedAt)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      }),
    )
    // Streak starts from today if studied today, otherwise from yesterday
    let streak = 0
    let cur = dateTsSet.has(todayTs) ? todayTs : todayTs - 86_400_000
    while (dateTsSet.has(cur)) {
      streak++
      cur -= 86_400_000
    }
    // Sessions this week
    const weekAgoTs = todayTs - 7 * 86_400_000
    const thisWeekSessions = sessionDates.filter(
      (s) => new Date(s.completedAt).getTime() >= weekAgoTs,
    ).length

    return {
      cards,
      lastSession: lastSessionRows[0] ?? null,
      lastCompletedSession: recentSessionRows[0] ?? null,
      streak,
      thisWeekSessions,
    }
  }),

  // Upsert on every session START — survives logout/login
  saveLastSession: protectedProcedure
    .input(
      z.object({
        wordSetKey: z.string(),
        wordSetDetail: z.string(),
        mode: z.string(),
        sessionSize: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db
        .insert(userLastSession)
        .values({
          userId,
          wordSetKey: input.wordSetKey,
          wordSetDetail: input.wordSetDetail,
          mode: input.mode,
          sessionSize: input.sessionSize,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userLastSession.userId,
          set: {
            wordSetKey: input.wordSetKey,
            wordSetDetail: input.wordSetDetail,
            mode: input.mode,
            sessionSize: input.sessionSize,
            updatedAt: new Date(),
          },
        })
    }),

  // Deprecated: use batchRecordCards instead (kept for compatibility)
  recordCard: protectedProcedure
    .input(z.object({ cardId: z.string(), correct: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const now = new Date()
      await db
        .insert(flashcardProgress)
        .values({
          userId,
          cardId: input.cardId,
          timesCorrect: input.correct ? 1 : 0,
          timesAttempted: 1,
          lastSeenAt: now,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [flashcardProgress.userId, flashcardProgress.cardId],
          set: {
            timesCorrect: sql`${flashcardProgress.timesCorrect} + ${input.correct ? 1 : 0}`,
            timesAttempted: sql`${flashcardProgress.timesAttempted} + 1`,
            lastSeenAt: now,
          },
        })
    }),

  // Batch version: saves all card results for a session in one call
  batchRecordCards: protectedProcedure
    .input(
      z.array(z.object({ cardId: z.string(), correct: z.boolean() })).min(1).max(100),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const now = new Date()
      for (const { cardId, correct } of input) {
        await db
          .insert(flashcardProgress)
          .values({
            userId,
            cardId,
            timesCorrect: correct ? 1 : 0,
            timesAttempted: 1,
            lastSeenAt: now,
            createdAt: now,
          })
          .onConflictDoUpdate({
            target: [flashcardProgress.userId, flashcardProgress.cardId],
            set: {
              timesCorrect: sql`${flashcardProgress.timesCorrect} + ${correct ? 1 : 0}`,
              timesAttempted: sql`${flashcardProgress.timesAttempted} + 1`,
              lastSeenAt: now,
            },
          })
      }
    }),

  saveSession: protectedProcedure
    .input(
      z.object({
        wordSetKey: z.string(),
        wordSetDetail: z.string(),
        mode: z.string(),
        sessionSize: z.number().int(),
        correctCount: z.number().int(),
        totalCount: z.number().int(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db.insert(studySessions).values({
        id: crypto.randomUUID(),
        userId,
        wordSetKey: input.wordSetKey,
        wordSetDetail: input.wordSetDetail,
        mode: input.mode,
        sessionSize: input.sessionSize,
        correctCount: input.correctCount,
        totalCount: input.totalCount,
        completedAt: new Date(),
      })
    }),

  getProfileStats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const [cards, allSessions, accountRows] = await Promise.all([
      db.select().from(flashcardProgress).where(eq(flashcardProgress.userId, userId)),
      db
        .select()
        .from(studySessions)
        .where(eq(studySessions.userId, userId))
        .orderBy(desc(studySessions.completedAt)),
      db
        .select({ providerId: accounts.providerId })
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .limit(5),
    ])

    // ── Streak & best streak ──────────────────────────────────────
    const todayMidnight = new Date()
    todayMidnight.setHours(0, 0, 0, 0)
    const todayTs = todayMidnight.getTime()
    const dateTsSet = new Set(
      allSessions.map((s) => {
        const d = new Date(s.completedAt)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      }),
    )
    let streak = 0
    let cur = dateTsSet.has(todayTs) ? todayTs : todayTs - 86_400_000
    while (dateTsSet.has(cur)) {
      streak++
      cur -= 86_400_000
    }

    const sortedDates = [...dateTsSet].sort((a, b) => a - b)
    let bestStreak = 0
    let currentRun = 0
    let prevTs: number | null = null
    for (const ts of sortedDates) {
      if (prevTs === null || ts - prevTs === 86_400_000) {
        currentRun++
      } else {
        currentRun = 1
      }
      if (currentRun > bestStreak) bestStreak = currentRun
      prevTs = ts
    }

    // ── This week ─────────────────────────────────────────────────
    const weekAgoTs = todayTs - 7 * 86_400_000
    const thisWeekSessions = allSessions.filter(
      (s) => new Date(s.completedAt).getTime() >= weekAgoTs,
    ).length

    // ── Aggregates ────────────────────────────────────────────────
    const totalSessions = allSessions.length
    const totalCorrect = allSessions.reduce((sum, s) => sum + s.correctCount, 0)
    const totalReviews = allSessions.reduce((sum, s) => sum + s.totalCount, 0)
    const lastSession = allSessions[0] ?? null
    const providers = accountRows.map((a) => a.providerId)

    return {
      cards,
      streak,
      bestStreak,
      thisWeekSessions,
      totalSessions,
      totalCorrect,
      totalReviews,
      lastSession,
      providers,
    }
  }),
})
