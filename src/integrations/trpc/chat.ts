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
const hintLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

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

  /**
   * Generate a single hint for the current flashcard.
   * Level 1: very vague (category only). Level 2: moderate. Level 3: near-answer.
   * Called on demand — one click = one hint = one API call.
   */
  generateHint: publicProcedure
    .input(
      z.object({
        char: z.string().max(20),
        pinyin: z.string().max(100),
        english: z.string().max(200),
        level: z.number().min(1).max(3),
        answerTarget: z.enum(['english', 'pinyin']),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = (ctx.session?.user.id ?? 'anonymous') + ':hint'
      if (!hintLimiter.check(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many hint requests. Please wait a moment.',
        })
      }

      const levelRules: Record<number, string> = {
        1: `Give a VERY VAGUE hint. Only mention the broad category or topic area. Examples: "A family role." "A type of food." "An action you do daily." Nothing more specific. One short sentence.`,
        2: `Give a MODERATE hint. Use: first letter of the answer, number of letters/syllables, or a fill-in-the-blank sentence. Example: "Starts with 'M', 3 letters" or "___ and Dad." Do NOT reveal the full answer.`,
        3: `Give a STRONG hint. Use: blanked-out letters, a rhyme, or an extremely obvious clue. Example: "M_m — rhymes with Tom." Still do NOT write the full answer.`,
      }

      const answerContext = input.answerTarget === 'pinyin'
        ? `The student needs to guess the PINYIN. The correct pinyin is "${input.pinyin}". Hint about pronunciation — never reveal the full pinyin.`
        : `The student needs to guess the ENGLISH MEANING. The correct meaning is "${input.english}". Hint about the meaning — never reveal the exact word/phrase.`

      const { text, usage } = await generateText({
        model: openai('gpt-4o-mini'),
        system: `You are a Chinese vocabulary hint generator. Give ONE short hint (1 sentence max). NEVER reveal the exact answer.`,
        prompt: `Chinese: ${input.char}\nPinyin: ${input.pinyin}\nEnglish: ${input.english}\n\n${answerContext}\n\nHint level ${input.level}/3:\n${levelRules[input.level]}`,
        temperature: 0.7,
        maxTokens: 60,
        abortSignal: AbortSignal.timeout(8_000),
      })

      logAiUsage({
        userId: ctx.session?.user.id,
        featureName: 'hint_generation',
        model: 'gpt-4o-mini',
        inputTokens: usage?.promptTokens,
        outputTokens: usage?.completionTokens,
        metadata: { level: input.level },
      })
      logEvent({
        userId: ctx.session?.user.id,
        eventName: input.level === 1 ? 'hint_revealed' : input.level === 2 ? 'hint_level_2' : 'hint_level_3',
      })

      return { hint: text.trim() || 'Think about the context this word is used in.' }
    }),
})
