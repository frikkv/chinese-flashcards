import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'
import type { Word } from '#/data/vocabulary'
import { logAiUsage } from '#/server/ai-usage'

/**
 * Generate 3 wrong-answer distractors for a Chinese vocab flashcard.
 *
 * Strategy: think like a teacher writing a quiz, not a dictionary.
 * Distractors should be from the same *learner confusion class* as the
 * correct answer — other words a student might realistically pick —
 * not synonyms, paraphrases, or glosses of the correct answer.
 */
export async function generateDistractors(
  word: Word,
  allVocab: Word[],
): Promise<{ distractors: string[]; source: 'ai' | 'fallback' }> {
  const category = detectCategory(word.english)

  try {
    const { object, usage } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: z.object({
        distractors: z
          .array(z.string())
          .length(3)
          .describe('3 wrong but plausible English meanings from the same category'),
      }),
      system: SYSTEM_PROMPT,
      prompt: buildPrompt(word, category),
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

// ── Prompt ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You generate wrong answer options for Chinese vocabulary flashcards aimed at language learners.

CRITICAL RULES:
1. Think like a teacher writing a multiple-choice quiz — distractors should be OTHER WORDS a student might confuse with the correct answer, NOT rephrases or synonyms of it.
2. NEVER generate paraphrases, synonyms, or near-synonyms of the correct answer.
3. NEVER generate awkward multi-word glosses. If the correct answer is a simple word like "Mom", distractors must also be simple words like "Dad", "Sister", "Grandma" — NOT "Caregiver", "Nurturer", "Guardian".
4. All distractors must be the same part of speech and answer type as the correct answer (noun↔noun, verb↔verb, phrase↔phrase, question↔question).
5. Distractors must come from the SAME SEMANTIC CATEGORY / confusion class:
   - Family terms → other family roles (Mom → Dad, Sister, Grandma)
   - Person/gender words → other person categories (Boy → Girl, Man, Child)
   - Food → other foods
   - Animals → other animals
   - Colors → other colors
   - Numbers → other numbers
   - Time words → other time expressions
   - Places → other places
   - Occupations → other occupations
   - Common phrases → other common phrases of similar conversational type
   - Question phrases → other question phrases
   - Pronouns → other pronouns
   - Adjectives → other adjectives in the same domain
   - Verbs → other verbs a beginner might confuse
6. Use short, natural, common English that a beginner learner would encounter.
7. Each distractor must be clearly different from the correct answer and from each other.
8. There must be exactly ONE best answer — the distractors must be clearly wrong once you know the word.`

function buildPrompt(word: Word, category: string | null): string {
  let prompt = `Chinese: ${word.char}\nPinyin: ${word.pinyin}\nCorrect answer: ${word.english}`
  if (category) {
    prompt += `\nCategory hint: ${category} — generate other ${category} as distractors`
  }
  prompt += '\n\nGenerate exactly 3 wrong answers from the same category. Short, natural English only.'
  return prompt
}

// ── Category detection ──────────────────────────────────────────

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/\b(mom|dad|mother|father|sister|brother|grandm|grandp|aunt|uncle|cousin|daughter|son|wife|husband|parent)\b/i, 'family members'],
  [/\b(boy|girl|man|woman|child|baby|person|people|friend|teacher|student|doctor|driver|manager|police|lawyer|worker)\b/i, 'people / roles'],
  [/\b(red|blue|green|yellow|white|black|orange|purple|pink|brown|grey|gray)\b/i, 'colors'],
  [/\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|zero|first|second|third)\b/i, 'numbers'],
  [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|morning|afternoon|evening|night|week|month|year|hour|minute|spring|summer|autumn|fall|winter)\b/i, 'time expressions'],
  [/\b(eat|drink|sleep|walk|run|read|write|speak|listen|watch|play|study|work|sit|stand|go|come|buy|sell|give|take|make|cook|drive|swim|fly|climb)\b/i, 'common verbs'],
  [/\b(big|small|tall|short|long|old|young|new|hot|cold|fast|slow|good|bad|happy|sad|easy|difficult|clean|dirty|beautiful|ugly|expensive|cheap|important|busy|quiet|noisy)\b/i, 'adjectives'],
  [/\b(rice|noodle|bread|tea|coffee|water|juice|beer|wine|milk|soup|cake|fruit|meat|fish|chicken|egg|vegetable|apple|banana)\b/i, 'food and drink'],
  [/\b(cat|dog|bird|fish|horse|pig|cow|sheep|panda|tiger|monkey|rabbit|mouse|chicken|duck|elephant)\b/i, 'animals'],
  [/\b(school|hospital|hotel|restaurant|bank|airport|station|office|library|park|store|shop|home|house|room|kitchen|bathroom|bedroom)\b/i, 'places'],
  [/\b(book|pen|phone|computer|car|bus|taxi|train|plane|table|chair|cup|glass|bottle|bag|hat|shoe|shirt|pants)\b/i, 'common objects'],
  [/\b(north|south|east|west|left|right|inside|outside|above|below|front|back|middle|between)\b/i, 'directions / positions'],
  [/\b(i |me|you|he|she|we|they|it|my|your|his|her|our|their)\b/i, 'pronouns'],
  [/\?\s*$/, 'question phrases'],
  [/\b(hello|goodbye|thank|sorry|please|welcome|congratul|excuse me|how are you)\b/i, 'common greetings / polite phrases'],
  [/\bhonor|surname|name\b/i, 'polite expressions / questions about identity'],
]

function detectCategory(english: string): string | null {
  const lower = english.toLowerCase()
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(lower)) return category
  }
  return null
}

// ── Validation ──────────────────────────────────────────────────

/**
 * Filter out distractors that are too similar to the correct answer.
 * Catches synonyms, paraphrases, substring matches, and trivial variants.
 */
function validateDistractors(raw: string[], correctAnswer: string): string[] {
  const correct = correctAnswer.toLowerCase().trim()
  const correctWords = new Set(correct.split(/\s+/).filter((w) => w.length > 2))

  const filtered = raw
    .map((d) => d.trim())
    .filter((d) => d.length > 0)
    .filter((d) => {
      const lower = d.toLowerCase()

      // Exact match
      if (lower === correct) return false

      // Substring containment (either direction)
      if (lower.includes(correct) || correct.includes(lower)) return false

      // Shares too many significant words with the correct answer
      if (correctWords.size > 0) {
        const dWords = lower.split(/\s+/).filter((w) => w.length > 2)
        const shared = dWords.filter((w) => correctWords.has(w)).length
        if (shared > 0 && shared >= Math.ceil(correctWords.size * 0.5)) return false
      }

      // Known synonym pairs that make MC trivial
      if (areSynonyms(correct, lower)) return false

      // Reject if distractor is just correct + adjective (e.g. "young man" for "man")
      if (lower.split(/\s+/).length > correct.split(/\s+/).length) {
        const withoutFirst = lower.split(/\s+/).slice(1).join(' ')
        const withoutLast = lower.split(/\s+/).slice(0, -1).join(' ')
        if (withoutFirst === correct || withoutLast === correct) return false
      }

      return true
    })

  return [...new Set(filtered)].slice(0, 3)
}

/** Check for known synonym/gloss pairs that would make MC trivial. */
function areSynonyms(a: string, b: string): boolean {
  const pairs: [string, string][] = [
    ['mom', 'mother'], ['dad', 'father'], ['grandma', 'grandmother'],
    ['grandpa', 'grandfather'], ['boy', 'male child'], ['girl', 'female child'],
    ['man', 'male'], ['woman', 'female'], ['child', 'kid'],
    ['surname', 'family name'], ['surname', 'last name'],
    ['hello', 'hi'], ['goodbye', 'bye'], ['thank you', 'thanks'],
    ['big', 'large'], ['small', 'little'], ['happy', 'glad'],
    ['beautiful', 'pretty'], ['fast', 'quick'], ['begin', 'start'],
  ]
  for (const [x, y] of pairs) {
    if ((a === x && b === y) || (a === y && b === x)) return true
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) return true
  }
  return false
}

// ── Fallback ────────────────────────────────────────────────────

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
