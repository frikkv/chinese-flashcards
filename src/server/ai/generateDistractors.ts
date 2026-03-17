import OpenAI from 'openai'
import type { Word } from '#/data/vocabulary'

// Lazy client — created on first call so env vars are always loaded
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

export async function generateDistractors(
  word: Word,
  allVocab: Word[],
): Promise<{ distractors: string[]; source: 'ai' | 'fallback' }> {
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You generate incorrect but plausible English answer options for Chinese vocabulary flashcards. Return JSON only.',
        },
        {
          role: 'user',
          content: `Chinese word: ${word.char}\nPinyin: ${word.pinyin}\nCorrect meaning: ${word.english}\n\nGenerate exactly 3 wrong but plausible English meanings.\nRules:\n- similar meaning category\n- not synonyms of the correct answer\n- not identical to the correct answer\n- short natural phrases\n- avoid duplicates\n\nReturn JSON only:\n{ "distractors": ["...", "...", "..."] }`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 100,
    })
    const raw = completion.choices[0]?.message?.content ?? ''
    const parsed = JSON.parse(raw) as { distractors: unknown[] }
    const validated = validateDistractors(parsed.distractors, word.english)
    if (validated.length === 3) return { distractors: validated, source: 'ai' }
  } catch {
    // fall through to fallback
  }
  return {
    distractors: fallbackDistractors(word, allVocab),
    source: 'fallback',
  }
}

function validateDistractors(raw: unknown[], correctAnswer: string): string[] {
  const normalized = correctAnswer.toLowerCase().trim()
  return [
    ...new Set(
      raw
        .filter(
          (d): d is string => typeof d === 'string' && d.trim().length > 0,
        )
        .map((d) => d.trim())
        .filter((d) => d.toLowerCase() !== normalized),
    ),
  ].slice(0, 3)
}

function fallbackDistractors(word: Word, allVocab: Word[]): string[] {
  const correct = word.english.toLowerCase()
  return shuffle(
    allVocab.filter(
      (w) => w.char !== word.char && w.english.toLowerCase() !== correct,
    ),
  )
    .slice(0, 3)
    .map((w) => w.english)
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
