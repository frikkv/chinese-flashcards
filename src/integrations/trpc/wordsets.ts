import { z } from 'zod'
import { eq, desc, and } from 'drizzle-orm'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, protectedProcedure } from './init'
import { db } from '#/db'
import { customWordSets } from '#/db/schema'
import { extractText } from '#/server/extractors'
import { generateWordSet } from '#/server/ai/generateWordSet'

// In-memory rate limit: max 5 AI generations per 10 minutes per user
const generateRateLimit = new Map<string, number[]>()
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT = 5

const WordSchema = z.object({
  char: z.string().min(1),
  pinyin: z.string().min(1),
  english: z.string().min(1),
})

export const wordsetsRouter = createTRPCRouter({
  // Extract + AI-generate words from an uploaded document (does NOT save to DB)
  generate: protectedProcedure
    .input(
      z.object({
        fileName: z.string().max(255).optional(),
        // Base64-encoded file, max ~2.7MB base64 (≈2MB raw)
        fileBase64: z.string().max(3_800_000).optional(),
        pasteText: z.string().max(20_000).optional(),
      }).refine(
        (d) => (d.fileBase64 && d.fileName) || (d.pasteText && d.pasteText.trim().length > 0),
        { message: 'Provide either a file or text.' },
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
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid file data.' })
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
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No readable text found.' })
      }

      // AI extraction
      const words = await generateWordSet(text)
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
        sourceFileName: input.sourceFileName,
        createdAt: new Date(),
      })
      return { id }
    }),

  // List user's saved custom word sets
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    const rows = await db
      .select()
      .from(customWordSets)
      .where(eq(customWordSets.userId, userId))
      .orderBy(desc(customWordSets.createdAt))
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      words: JSON.parse(row.wordsJson) as { char: string; pinyin: string; english: string }[],
      wordCount: row.wordCount,
      sourceFileName: row.sourceFileName,
      createdAt: row.createdAt,
    }))
  }),

  // Delete a custom word set (only the owner can delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      await db
        .delete(customWordSets)
        .where(and(eq(customWordSets.id, input.id), eq(customWordSets.userId, userId)))
    }),
})
