import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import type { Word } from '#/data/vocabulary'
import { logAiUsage } from '#/server/ai-usage'

export async function generateDistractors(
  word: Word,
  allVocab: Word[],
): Promise<{ distractors: string[]; source: 'ai' | 'fallback' }> {
  try {
    const { object, usage } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        distractors: z
          .array(z.string())
          .length(3)
          .describe('3 wrong but plausible English meanings'),
      }),
      system:
        'You generate incorrect but plausible English answer options for Chinese vocabulary flashcards.',
      prompt: `Chinese word: ${word.char}\nPinyin: ${word.pinyin}\nCorrect meaning: ${word.english}\n\nGenerate exactly 3 wrong but plausible English meanings.\nRules:\n- similar meaning category\n- not synonyms of the correct answer\n- not identical to the correct answer\n- short natural phrases\n- avoid duplicates`,
      temperature: 0.7,
      maxTokens: 100,
    })
    logAiUsage({
      featureName: 'distractor_generation',
      model: 'gpt-4o-mini',
      inputTokens: usage?.promptTokens,
      outputTokens: usage?.completionTokens,
    })

    const validated = validateDistractors(object.distractors, word.english)
    if (validated.length === 3) return { distractors: validated, source: 'ai' }
  } catch {
    // fall through to fallback
  }
  return {
    distractors: fallbackDistractors(word, allVocab),
    source: 'fallback',
  }
}

function validateDistractors(raw: string[], correctAnswer: string): string[] {
  const normalized = correctAnswer.toLowerCase().trim()
  return [
    ...new Set(
      raw
        .filter((d) => d.trim().length > 0)
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
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}
