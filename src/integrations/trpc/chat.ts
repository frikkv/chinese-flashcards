import { generateText, generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, publicProcedure } from './init'
import { db } from '#/db'
import { chatMessages } from '#/db/schema'
import { createRateLimiter } from '#/lib/rate-limit'
import { logEvent } from '#/server/analytics'
import { logAiUsage } from '#/server/ai-usage'

// In-memory, best-effort for serverless (resets on cold start)
const chatLimiter = createRateLimiter({ windowMs: 60_000, max: 20 })

// ── SYSTEM PROMPT ─────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `You are a helpful Mandarin Chinese learning tutor. Your role is exclusively to help learners understand Chinese vocabulary, grammar, pronunciation, tones, usage, sentence structure, and related cultural context.

When giving example sentences, always provide all three lines:
- Simplified Chinese characters
- Pinyin with tone marks
- English translation

Keep explanations concise and beginner-friendly by default. Use short paragraphs. If the user asks for more detail, provide it.

If the user asks something entirely unrelated to Chinese language or learning, politely redirect them back to their Chinese studies.`

// ── INPUT SCHEMA ──────────────────────────────────────────────────
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(2000),
})

const CardContextSchema = z.object({
  char: z.string(),
  pinyin: z.string(),
  english: z.string(),
  category: z.string().optional(),
})

export const chatRouter = createTRPCRouter({
  sendMessage: publicProcedure
    .input(
      z.object({
        messages: z.array(MessageSchema).min(1).max(30),
        cardContext: CardContextSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limit by userId or a fixed anonymous key
      const rateLimitKey = ctx.session?.user.id ?? 'anonymous'
      if (!chatLimiter.check(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many messages. Please wait a moment before continuing.',
        })
      }

      // Build system prompt — inject card context if provided
      let systemPrompt = BASE_SYSTEM_PROMPT
      if (input.cardContext) {
        const { char, pinyin, english, category } = input.cardContext
        systemPrompt +=
          `\n\nThe user is currently studying this flashcard:\n` +
          `- Character: ${char}\n` +
          `- Pinyin: ${pinyin}\n` +
          `- English: ${english}` +
          (category ? `\n- Category: ${category}` : '')
      }

      const { text: assistantContent, usage: chatUsage } = await generateText({
        model: openai('gpt-4o-mini'),
        system: systemPrompt,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        maxTokens: 600,
        abortSignal: AbortSignal.timeout(15_000),
      })
      logAiUsage({
        userId: ctx.session?.user.id,
        featureName: 'chat',
        model: 'gpt-4o-mini',
        inputTokens: chatUsage?.promptTokens,
        outputTokens: chatUsage?.completionTokens,
      })

      const finalContent =
        assistantContent.trim() ||
        'Sorry, I could not generate a response. Please try again.'

      // Save to DB for logged-in users
      if (ctx.session?.user.id) {
        const userId = ctx.session.user.id
        const contextJson = input.cardContext
          ? JSON.stringify(input.cardContext)
          : null
        const userMessage = input.messages[input.messages.length - 1]!
        await db.insert(chatMessages).values([
          {
            id: crypto.randomUUID(),
            userId,
            role: 'user',
            content: userMessage.content,
            cardContext: contextJson,
            createdAt: new Date(),
          },
          {
            id: crypto.randomUUID(),
            userId,
            role: 'assistant',
            content: finalContent,
            cardContext: contextJson,
            createdAt: new Date(),
          },
        ])
      }

      logEvent({
        userId: ctx.session?.user.id,
        eventName: 'chat_message_sent',
      })
      return { content: finalContent }
    }),

  translateToZh: publicProcedure
    .input(z.object({ text: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = (ctx.session?.user.id ?? 'anonymous') + ':translate'
      if (!chatLimiter.check(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait a moment.',
        })
      }

      try {
        const { object, usage: translateUsage } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema: z.object({
            char: z.string().describe('Mandarin Chinese characters'),
            pinyin: z.string().describe('Pinyin with tone diacritics'),
          }),
          system:
            'Translate the given text to Mandarin Chinese.',
          prompt: input.text,
          temperature: 0.2,
          maxTokens: 150,
          abortSignal: AbortSignal.timeout(10_000),
        })

        logAiUsage({
          userId: ctx.session?.user.id,
          featureName: 'translate',
          model: 'gpt-4o-mini',
          inputTokens: translateUsage?.promptTokens,
          outputTokens: translateUsage?.completionTokens,
        })
        return { char: object.char, pinyin: object.pinyin }
      } catch {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Translation failed.',
        })
      }
    }),
})
