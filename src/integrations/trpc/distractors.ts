import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, publicProcedure } from './init'
import { db } from '#/db'
import { distractorSets } from '#/db/schema'
import { generateDistractors } from '#/server/ai/generateDistractors'
import { hsk1Words, hsk2Words, lang1511Units } from '#/data/vocabulary'
import { createRateLimiter } from '#/lib/rate-limit'

const allVocab = [
  ...hsk1Words,
  ...hsk2Words,
  ...lang1511Units.flatMap((u) => u.words),
]

// 60 requests per minute per user — generous enough for a 30-card MC session
// with prefetch (worst case ~30 unique lookups), but blocks automated abuse.
const distractorLimiter = createRateLimiter({ windowMs: 60_000, max: 60 })

export const distractorsRouter = createTRPCRouter({
  getDistractors: publicProcedure
    .input(
      z.object({
        vocabKey: z.string().max(50),
        char: z.string().max(20),
        pinyin: z.string().max(100),
        correctAnswer: z.string().max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = ctx.session?.user.id ?? 'anonymous'
      if (!distractorLimiter.check(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait a moment before continuing.',
        })
      }

      const existing = await db
        .select()
        .from(distractorSets)
        .where(eq(distractorSets.vocabKey, input.vocabKey))
      if (existing.length > 0) {
        const row = existing[Math.floor(Math.random() * existing.length)]!
        const distractors = JSON.parse(row.distractorsJson) as string[]
        return { distractors, source: row.source, cached: true }
      }
      const word = {
        char: input.char,
        pinyin: input.pinyin,
        english: input.correctAnswer,
      }
      const { distractors, source } = await generateDistractors(word, allVocab)
      await db.insert(distractorSets).values({
        id: crypto.randomUUID(),
        vocabKey: input.vocabKey,
        correctAnswer: input.correctAnswer,
        distractorsJson: JSON.stringify(distractors),
        source,
        createdAt: new Date(),
      })
      return { distractors, source, cached: false }
    }),

  generateDistractorSet: publicProcedure
    .input(
      z.object({
        char: z.string().max(20),
        pinyin: z.string().max(100),
        english: z.string().max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = ctx.session?.user.id ?? 'anonymous'
      if (!distractorLimiter.check(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait a moment before continuing.',
        })
      }
      const word = {
        char: input.char,
        pinyin: input.pinyin,
        english: input.english,
      }
      const { distractors, source } = await generateDistractors(word, allVocab)
      await db.insert(distractorSets).values({
        id: crypto.randomUUID(),
        vocabKey: input.char,
        correctAnswer: input.english,
        distractorsJson: JSON.stringify(distractors),
        source,
        createdAt: new Date(),
      })
      return { distractors, source }
    }),
})
