import OpenAI from 'openai'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { createTRPCRouter, publicProcedure } from './init'
import { db } from '#/db'
import { chatMessages } from '#/db/schema'

// ── OPENAI CLIENT ─────────────────────────────────────────────────
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

// ── RATE LIMITER (in-memory, best-effort for serverless) ──────────
const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 20

function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const prev = (rateLimitMap.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (prev.length >= RATE_LIMIT_MAX) return false
  rateLimitMap.set(key, [...prev, now])
  return true
}

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
      if (!checkRateLimit(rateLimitKey)) {
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

      // Call GPT-4o-mini
      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.7,
        max_tokens: 600,
      })

      const assistantContent =
        completion.choices[0]?.message?.content?.trim() ??
        'Sorry, I could not generate a response. Please try again.'

      // Save to DB for logged-in users
      if (ctx.session?.user.id) {
        const userId = ctx.session.user.id
        const contextJson = input.cardContext ? JSON.stringify(input.cardContext) : null
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
            content: assistantContent,
            cardContext: contextJson,
            createdAt: new Date(),
          },
        ])
      }

      return { content: assistantContent }
    }),

  translateToZh: publicProcedure
    .input(z.object({ text: z.string().min(1).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const rateLimitKey = (ctx.session?.user.id ?? 'anonymous') + ':translate'
      if (!checkRateLimit(rateLimitKey)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many requests. Please wait a moment.',
        })
      }

      const completion = await getOpenAI().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Translate the given text to Mandarin Chinese. Respond ONLY with a JSON object: {"char":"...","pinyin":"..."}. No explanation, no markdown, no other text.',
          },
          { role: 'user', content: input.text },
        ],
        max_tokens: 150,
        temperature: 0.2,
      })

      const raw = completion.choices[0]?.message?.content?.trim() ?? ''
      try {
        const parsed = JSON.parse(raw)
        return { char: String(parsed.char ?? ''), pinyin: String(parsed.pinyin ?? '') }
      } catch {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Translation failed.' })
      }
    }),
})
