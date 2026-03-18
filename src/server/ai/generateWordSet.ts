import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import type { Dialect } from '#/lib/dialect'

interface Word {
  char: string
  pinyin: string
  english: string
  jyutping?: string
}

// ── Dialect-aware config ─────────────────────────────────────────────

function dialectConfig(dialect: Dialect) {
  const isCanto = dialect === 'cantonese'
  const pronField = isCanto ? 'jyutping' : 'pinyin'
  const pronDesc = isCanto
    ? 'Jyutping romanization with tone numbers 1-6, e.g. "nei5 hou2"'
    : 'Pinyin with tone diacritics, e.g. "nǐ hǎo"'
  const lang = isCanto ? 'Cantonese' : 'Chinese'

  const wordSchema = z.object({
    char: z.string().describe(`${lang} character(s)`),
    [pronField]: z.string().describe(pronDesc),
    english: z.string().describe('Concise English meaning'),
  })

  const diffSchema = z.object({
    add: z.array(wordSchema).optional().describe('New words to append'),
    remove: z.array(z.string()).optional().describe('Characters to delete'),
    modify: z
      .array(
        z.object({
          char: z.string(),
          [pronField]: z.string().optional(),
          english: z.string().optional(),
        }),
      )
      .optional()
      .describe('Words to update (matched by char)'),
  })

  const toWord = (w: Record<string, string>): Word =>
    isCanto
      ? { char: w.char, pinyin: '', english: w.english, jyutping: w[pronField] }
      : { char: w.char, pinyin: w[pronField] ?? '', english: w.english }

  return { isCanto, pronField, lang, wordSchema, diffSchema, toWord }
}

// ── Extract from text ────────────────────────────────────────────────

export async function generateWordSet(
  text: string,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const { lang, wordSchema, toWord } = dialectConfig(dialect)

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({ words: z.array(wordSchema) }),
    system: `You are a ${lang} language expert. Extract vocabulary from the provided text. Only include actual vocabulary present in the text. Prefer the most useful/frequent ones. No duplicate characters.`,
    prompt: `Extract ${lang} vocabulary from this text:\n\n${text}`,
    temperature: 0.1,
    maxTokens: 2000,
    abortSignal: AbortSignal.timeout(30_000),
  })

  return dedupe(object.words.map(toWord)).slice(0, 60)
}

// ── Generate from prompt ─────────────────────────────────────────────

export async function generateWordSetFromPrompt(
  prompt: string,
  wordCount?: number,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const { lang, wordSchema, toWord } = dialectConfig(dialect)
  const countInstruction = wordCount
    ? `Generate approximately ${wordCount}`
    : 'Generate a comprehensive list of'

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({ words: z.array(wordSchema) }),
    system: `You are a ${lang} language expert. Generate useful, real vocabulary matching the user's description. Order by frequency. No duplicate characters.`,
    prompt: `${countInstruction} ${lang} vocabulary words/phrases for: ${prompt}`,
    temperature: 0.3,
    maxTokens: 4000,
    abortSignal: AbortSignal.timeout(30_000),
  })

  return dedupe(object.words.map(toWord)).slice(0, wordCount ?? 60)
}

// ── AI edit (diff-based) ─────────────────────────────────────────────

export async function editWordSetWithAI(
  words: Word[],
  instruction: string,
  dialect: Dialect = 'mandarin',
): Promise<Word[]> {
  const { lang, pronField, diffSchema, toWord } = dialectConfig(dialect)

  const wordsJson = JSON.stringify(
    words.map((w) => {
      const obj: Record<string, string> = { char: w.char, english: w.english }
      obj[pronField] = (dialect === 'cantonese' ? w.jyutping : w.pinyin) ?? ''
      return obj
    }),
  )

  try {
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: diffSchema,
      system: `You are a ${lang} language expert. You will receive a word list and an instruction. Return ONLY the diff — do NOT return unchanged words. Follow the instruction precisely.`,
      prompt: `Current word list:\n${wordsJson}\n\nInstruction: ${instruction}`,
      temperature: 0.2,
      maxTokens: 2000,
      abortSignal: AbortSignal.timeout(30_000),
    })

    // Apply removals
    const removeSet = new Set(object.remove ?? [])
    let result = words.filter((w) => !removeSet.has(w.char))

    // Apply modifications
    if (object.modify?.length) {
      const modMap = new Map(object.modify.map((m) => [m.char, m]))
      result = result.map((w) => {
        const m = modMap.get(w.char)
        if (!m) return w
        const merged: Record<string, string> = {
          char: w.char,
          [pronField]: (m as Record<string, string | undefined>)[pronField] ??
            (dialect === 'cantonese' ? w.jyutping : w.pinyin) ?? '',
          english: m.english ?? w.english,
        }
        return toWord(merged)
      })
    }

    // Apply additions (deduplicate against existing)
    if (object.add?.length) {
      const existing = new Set(result.map((w) => w.char))
      for (const a of object.add) {
        if (!existing.has(a.char)) {
          result.push(toWord(a as Record<string, string>))
          existing.add(a.char)
        }
      }
    }

    return result.length === 0 && words.length > 0 ? words : result.slice(0, 200)
  } catch {
    return words
  }
}

// ── Util ─────────────────────────────────────────────────────────────

function dedupe(words: Word[]): Word[] {
  const seen = new Set<string>()
  return words.filter((w) => {
    if (seen.has(w.char)) return false
    seen.add(w.char)
    return true
  })
}
