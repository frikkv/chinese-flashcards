import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { createTRPCRouter, publicProcedure } from './init'
import { db } from '#/db'
import { distractorSets } from '#/db/schema'
import { generateDistractors } from '#/server/ai/generateDistractors'
import { hsk1Words, hsk2Words, lang1511Units } from '#/data/vocabulary'

const allVocab = [
  ...hsk1Words,
  ...hsk2Words,
  ...lang1511Units.flatMap((u) => u.words),
]

export const distractorsRouter = createTRPCRouter({
  getDistractors: publicProcedure
    .input(
      z.object({
        vocabKey: z.string(),
        char: z.string(),
        pinyin: z.string(),
        correctAnswer: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await db
        .select()
        .from(distractorSets)
        .where(eq(distractorSets.vocabKey, input.vocabKey))
      if (existing.length > 0) {
        const row = existing[Math.floor(Math.random() * existing.length)]!
        const distractors = JSON.parse(row.distractorsJson) as string[]
        return { distractors, source: row.source, cached: true }
      }
      const word = { char: input.char, pinyin: input.pinyin, english: input.correctAnswer }
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
        char: z.string(),
        pinyin: z.string(),
        english: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const word = { char: input.char, pinyin: input.pinyin, english: input.english }
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
