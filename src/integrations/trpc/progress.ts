import { z } from 'zod'
import { eq, desc, sql } from 'drizzle-orm'
import { createTRPCRouter, protectedProcedure } from './init'
import { db } from '#/db'
import { flashcardProgress, studySessions, userLastSession } from '#/db/schema'

export const progressRouter = createTRPCRouter({
  getProgress: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const [cards, lastSessionRows, recentSessionRows] = await Promise.all([
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
    ])
    return {
      cards,
      lastSession: lastSessionRows[0] ?? null,
      lastCompletedSession: recentSessionRows[0] ?? null,
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

  recordCard: protectedProcedure
    .input(z.object({ cardId: z.string(), correct: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db
        .insert(flashcardProgress)
        .values({
          userId,
          cardId: input.cardId,
          timesCorrect: input.correct ? 1 : 0,
          timesAttempted: 1,
          lastSeenAt: new Date(),
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [flashcardProgress.userId, flashcardProgress.cardId],
          set: {
            timesCorrect: sql`${flashcardProgress.timesCorrect} + ${input.correct ? 1 : 0}`,
            timesAttempted: sql`${flashcardProgress.timesAttempted} + 1`,
            lastSeenAt: new Date(),
          },
        })
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
})
