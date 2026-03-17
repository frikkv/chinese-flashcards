import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from './init'
import { db } from '#/db'
import { customWordSets } from '#/db/schema'
import { extractText } from '#/server/extractors'
import {
  generateWordSet,
  generateWordSetFromPrompt,
  editWordSetWithAI,
} from '#/server/ai/generateWordSet'

// In-memory rate limit: max 5 AI generations per 10 minutes per user
const generateRateLimit = new Map<string, number[]>()
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5

const WordSchema = z.object({
  char: z.string().min(1),
  pinyin: z.string(),
  english: z.string().min(1),
  jyutping: z.string().optional(),
})

export const wordsetsRouter = createTRPCRouter({
  // Extract + AI-generate words from an uploaded document (does NOT save to DB)
  generate: protectedProcedure
    .input(
      z
        .object({
          fileName: z.string().max(255).optional(),
          // Base64-encoded file, max ~2.7MB base64 (≈2MB raw)
          fileBase64: z.string().max(3_800_000).optional(),
          pasteText: z.string().max(20_000).optional(),
          // AI prompt-based generation
          promptText: z.string().min(3).max(500).optional(),
          wordCount: z.number().int().min(1).max(60).optional(),
          dialect: z.enum(['mandarin', 'cantonese']).default('mandarin'),
        })
        .refine(
          (d) =>
            (d.fileBase64 && d.fileName) ||
            (d.pasteText && d.pasteText.trim().length > 0) ||
            (d.promptText && d.promptText.trim().length >= 3),
          { message: 'Provide a file, text, or prompt.' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Rate limit check
      const now = Date.now()
      const times = (generateRateLimit.get(userId) ?? []).filter(
        (t) => now - t < RATE_WINDOW_MS,
      )
      if (times.length >= RATE_LIMIT) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit: 5 document generations per 10 minutes.',
        })
      }
      times.push(now)
      generateRateLimit.set(userId, times)

      // AI prompt-based generation (no source text needed)
      if (input.promptText) {
        const words = await generateWordSetFromPrompt(
          input.promptText.trim(),
          input.wordCount,
          input.dialect,
        )
        if (words.length === 0) {
          throw new TRPCError({
            code: 'UNPROCESSABLE_CONTENT',
            message: 'Could not generate vocabulary for that description.',
          })
        }
        return { words }
      }

      let text: string
      if (input.pasteText) {
        // Paste path: preprocess directly (normalize + clean + select Chinese-dense)
        const { preprocessText } = await import('#/server/extractors')
        text = preprocessText(input.pasteText)
      } else {
        // File upload path
        let buffer: Buffer
        try {
          buffer = Buffer.from(input.fileBase64!, 'base64')
        } catch {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Invalid file data.',
          })
        }
        try {
          text = await extractText(input.fileName!, buffer)
        } catch (e) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: e instanceof Error ? e.message : 'Failed to read file.',
          })
        }
      }

      if (text.trim().length < 10) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No readable text found.',
        })
      }

      // AI extraction
      const words = await generateWordSet(text, input.dialect)
      if (words.length === 0) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: 'No Chinese vocabulary found in document.',
        })
      }

      return { words }
    }),

  // Save a generated (or manually created) word set to the DB
  save: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        words: z.array(WordSchema).min(1).max(200),
        sourceFileName: z.string().max(255).optional(),
        dialect: z.enum(['mandarin', 'cantonese']).default('mandarin'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const id = crypto.randomUUID()
      await db.insert(customWordSets).values({
        id,
        userId,
        name: input.name,
        wordsJson: JSON.stringify(input.words),
        wordCount: input.words.length,
        dialect: input.dialect,
        sourceFileName: input.sourceFileName,
        createdAt: new Date(),
      })
      return { id }
    }),

  // List user's saved custom word sets (favorites first, then newest)
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select()
      .from(customWordSets)
      .where(eq(customWordSets.userId, userId))
      .orderBy(desc(customWordSets.isFavorited), desc(customWordSets.createdAt))
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      words: JSON.parse(row.wordsJson) as {
        char: string
        pinyin: string
        english: string
        jyutping?: string
      }[],
      wordCount: row.wordCount,
      dialect: row.dialect as 'mandarin' | 'cantonese',
      sourceFileName: row.sourceFileName,
      isFavorited: row.isFavorited,
      createdAt: row.createdAt,
    }))
  }),

  // Merge additional words into an existing word set (deduplicates by char)
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        additionalWords: z.array(WordSchema).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [existing] = await db
        .select()
        .from(customWordSets)
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const existingWords = JSON.parse(existing.wordsJson) as {
        char: string
        pinyin: string
        english: string
      }[]
      const existingChars = new Set(existingWords.map((w) => w.char))
      const merged = [
        ...existingWords,
        ...input.additionalWords.filter((w) => !existingChars.has(w.char)),
      ]
      await db
        .update(customWordSets)
        .set({ wordsJson: JSON.stringify(merged), wordCount: merged.length })
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      return { wordCount: merged.length }
    }),

  // Toggle favorite status for a word set
  toggleFavorite: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [existing] = await db
        .select()
        .from(customWordSets)
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      const next = !existing.isFavorited
      await db
        .update(customWordSets)
        .set({ isFavorited: next })
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      return { isFavorited: next }
    }),

  // Replace all words in a word set
  replaceWords: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        words: z.array(WordSchema).min(1).max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const [existing] = await db
        .select()
        .from(customWordSets)
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      if (!existing) throw new TRPCError({ code: 'NOT_FOUND' })
      await db
        .update(customWordSets)
        .set({
          wordsJson: JSON.stringify(input.words),
          wordCount: input.words.length,
        })
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
      return { wordCount: input.words.length }
    }),

  // AI-powered edit: modify a word list based on a natural language instruction
  aiEdit: protectedProcedure
    .input(
      z.object({
        words: z.array(WordSchema).min(1).max(200),
        instruction: z.string().min(3).max(500),
        dialect: z.enum(['mandarin', 'cantonese']).default('mandarin'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Rate limit (shares the same pool as generate)
      const now = Date.now()
      const times = (generateRateLimit.get(userId) ?? []).filter(
        (t) => now - t < RATE_WINDOW_MS,
      )
      if (times.length >= RATE_LIMIT) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Rate limit: 5 AI generations per 10 minutes.',
        })
      }
      times.push(now)
      generateRateLimit.set(userId, times)

      const words = await editWordSetWithAI(
        input.words,
        input.instruction,
        input.dialect,
      )
      if (words.length === 0) {
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: 'AI edit returned no words. Try a different instruction.',
        })
      }
      return { words }
    }),

  // Delete a custom word set (only the owner can delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db
        .delete(customWordSets)
        .where(
          and(
            eq(customWordSets.id, input.id),
            eq(customWordSets.userId, userId),
          ),
        )
    }),
})
