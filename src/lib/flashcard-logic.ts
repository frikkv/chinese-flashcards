/**
 * Pure, stateless helpers for the flashcard study engine.
 * No React, no side effects — safe to unit-test in isolation.
 */
import type { Word } from '#/data/vocabulary'
import type { Dialect } from '#/lib/dialect'
import { getRomanization, getRomanizationLabel } from '#/lib/dialect'
import type { CardContent } from '#/components/flashcard/CardFace'

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface QueueItem {
  word: Word
  stage: 1 | 2 | 3
}

// ── GENERAL HELPERS ──────────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}

/** Strip tone diacritics for loose answer comparison. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔùǖ]/g, 'u')
    .trim()
}

/** Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/**
 * Typo-tolerant comparison used for typed answers. Supports alternate
 * meanings separated by "/" or "," — input is correct if it matches any.
 * Allows roughly one typo per five characters.
 */
export function answersMatch(input: string, correct: string): boolean {
  const normInput = normalizeAnswer(input).replace(/[^a-z0-9\u4e00-\u9fff ]/g, '')
  if (!normInput) return false
  const alts = correct
    .split(/[/,]/)
    .map((s) => normalizeAnswer(s).replace(/[^a-z0-9\u4e00-\u9fff ]/g, ''))
    .filter(Boolean)
  if (alts.length === 0) return false
  for (const alt of alts) {
    if (alt === normInput) return true
    const len = Math.max(alt.length, normInput.length)
    // Short answers (≤3 chars) require exact match — a single typo is too much
    if (len <= 3) continue
    const threshold = len <= 6 ? 1 : len <= 10 ? 2 : 3
    if (levenshtein(alt, normInput) <= threshold) return true
  }
  return false
}

// ── TONE HELPERS ─────────────────────────────────────────────────────────────

const TONE_VOWELS: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
}

export function stripTones(s: string): string {
  return s
    .replace(/[āáǎà]/g, 'a')
    .replace(/[ēéěè]/g, 'e')
    .replace(/[īíǐì]/g, 'i')
    .replace(/[ōóǒò]/g, 'o')
    .replace(/[ūúǔù]/g, 'u')
    .replace(/[ǖǘǚǜ]/g, 'ü')
}

export function getSyllableTone(syllable: string): number {
  if (/[āēīōūǖ]/.test(syllable)) return 1
  if (/[áéíóúǘ]/.test(syllable)) return 2
  if (/[ǎěǐǒǔǚ]/.test(syllable)) return 3
  if (/[àèìòùǜ]/.test(syllable)) return 4
  return 0
}

export function applyToneToSyllable(syllable: string, tone: number): string {
  if (tone === 0) return syllable
  for (const v of ['a', 'e']) {
    if (syllable.includes(v)) return syllable.replace(v, TONE_VOWELS[v][tone])
  }
  if (syllable.includes('ou'))
    return syllable.replace('o', TONE_VOWELS['o'][tone])
  let lastIdx = -1
  let lastVowel = ''
  for (const v of ['i', 'o', 'u', 'ü']) {
    const idx = syllable.lastIndexOf(v)
    if (idx > lastIdx) {
      lastIdx = idx
      lastVowel = v
    }
  }
  if (lastIdx !== -1)
    return (
      syllable.slice(0, lastIdx) +
      TONE_VOWELS[lastVowel][tone] +
      syllable.slice(lastIdx + 1)
    )
  return syllable
}

/** Generate 4 tone options for a word (1 correct + 3 distractors). */
export function buildToneChoices(word: Word, vocab: Word[]): string[] {
  const syllables = word.pinyin.split(' ')
  const correctTones = syllables.map(getSyllableTone)
  const stripped = syllables.map(stripTones)
  const distractors = new Set<string>()

  if (syllables.length === 1) {
    shuffle([1, 2, 3, 4].filter((t) => t !== correctTones[0]))
      .slice(0, 3)
      .forEach((t) => distractors.add(applyToneToSyllable(stripped[0], t)))
  } else {
    let attempts = 0
    while (distractors.size < 3 && attempts < 200) {
      attempts++
      const newTones = [...correctTones]
      const numChanges = Math.min(
        1 + Math.floor(Math.random() * 2),
        syllables.length,
      )
      shuffle(syllables.map((_, i) => i))
        .slice(0, numChanges)
        .forEach((i) => {
          const others = [0, 1, 2, 3, 4].filter((t) => t !== newTones[i])
          newTones[i] = others[Math.floor(Math.random() * others.length)]
        })
      if (newTones.every((t, i) => t === correctTones[i])) continue
      const variant = stripped
        .map((s, i) => applyToneToSyllable(s, newTones[i]))
        .join(' ')
      if (variant !== word.pinyin) distractors.add(variant)
    }
  }

  if (distractors.size < 3) {
    shuffle(vocab.filter((w) => w.char !== word.char))
      .slice(0, 3 - distractors.size)
      .forEach((w) => distractors.add(w.pinyin))
  }

  return shuffle([word.pinyin, ...Array.from(distractors).slice(0, 3)])
}

// ── QUEUE BUILDER ────────────────────────────────────────────────────────────

/**
 * Build the ordered study queue for a session.
 *
 * Mode 1: stage [1] only — char+pinyin → English
 * Mode 2: stages [1, 2] — char → pinyin, then pinyin → English
 * Mode 3: stages [1, 2] interleaved with stage [3] Anki recall cards
 * Cantonese mode 1: stages [1] — char+jyutping → English
 * Cantonese mode 2: stages [1] interleaved with stage [2] recall
 */
export function buildQueue(
  vocab: Word[],
  mode: 1 | 2 | 3,
  size: number,
  dialect: Dialect = 'mandarin',
): QueueItem[] {
  const count = Math.min(size >= vocab.length ? vocab.length : size, vocab.length)
  const words = shuffle(vocab).slice(0, count)

  if (dialect === 'cantonese') {
    if (mode === 1) {
      return words.map((w) => ({ word: w, stage: 1 as const }))
    }
    const studiedSet = new Set<Word>()
    const pendingRecalls: QueueItem[] = shuffle(words).map((w) => ({
      word: w,
      stage: 2 as const,
    }))
    const result: QueueItem[] = []
    let pairsSinceLastRecall = 0
    for (let i = 0; i < words.length; i++) {
      const w = words[i]
      result.push({ word: w, stage: 1 })
      studiedSet.add(w)
      pairsSinceLastRecall++
      const eligibleIdx = pendingRecalls.findIndex(
        (r) => studiedSet.has(r.word) && r.word !== w,
      )
      if (eligibleIdx !== -1) {
        const remainingPairs = words.length - i - 1
        const forceInsert = pendingRecalls.length > remainingPairs + 1
        const insertProb = 0.5 + Math.min((pairsSinceLastRecall - 1) * 0.15, 0.35)
        if (forceInsert || Math.random() < insertProb) {
          const [recall] = pendingRecalls.splice(eligibleIdx, 1)
          result.push(recall)
          pairsSinceLastRecall = 0
        }
      }
    }
    result.push(...pendingRecalls)
    return result
  }

  if (mode !== 3) {
    const stages = (mode === 1 ? [1] : [1, 2]) as (1 | 2 | 3)[]
    return words.flatMap((w) => stages.map((s) => ({ word: w, stage: s })))
  }

  // Mode 3: interleave Anki recall cards (stage 3) between study pairs (stage 1+2).
  const studiedSet = new Set<Word>()
  const pendingRecalls: QueueItem[] = shuffle(words).map((w) => ({
    word: w,
    stage: 3 as const,
  }))
  const result: QueueItem[] = []
  let pairsSinceLastRecall = 0

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    result.push({ word: w, stage: 1 })
    result.push({ word: w, stage: 2 })
    studiedSet.add(w)
    pairsSinceLastRecall++

    const eligibleIdx = pendingRecalls.findIndex(
      (r) => studiedSet.has(r.word) && r.word !== w,
    )
    if (eligibleIdx !== -1) {
      const remainingPairs = words.length - i - 1
      const forceInsert = pendingRecalls.length > remainingPairs + 1
      const insertProb = 0.2 + Math.min((pairsSinceLastRecall - 1) * 0.1, 0.4)
      if (forceInsert || Math.random() < insertProb) {
        const [recall] = pendingRecalls.splice(eligibleIdx, 1)
        result.push(recall)
        pairsSinceLastRecall = 0
      }
    }
  }

  result.push(...pendingRecalls)
  return result
}

// ── CARD CONTENT ─────────────────────────────────────────────────────────────

export function getQuestionContent(
  word: Word,
  stage: 1 | 2 | 3,
  mode: 1 | 2 | 3,
  dialect: Dialect = 'mandarin',
): CardContent {
  const romanization = getRomanization(word, dialect)
  const romanLabel = getRomanizationLabel(dialect)

  if (dialect === 'cantonese') {
    if (mode === 1 || stage === 1) {
      return { tag: 'What does this mean?', char: word.char, pinyin: romanization }
    }
    return { tag: 'Recall the character', english: word.english, englishLarge: true, isRecall: true }
  }

  if (mode === 1 || stage === 2) {
    return { tag: 'What does this mean?', char: word.char, pinyin: word.pinyin }
  }
  if (stage === 1) {
    return { tag: `What is the ${romanLabel.toLowerCase()}?`, char: word.char }
  }
  return { tag: 'Recall the character', english: word.english, englishLarge: true, isRecall: true }
}

export function getAnswerContent(
  word: Word,
  stage: 1 | 2 | 3,
  mode: 1 | 2 | 3,
  dialect: Dialect = 'mandarin',
): CardContent {
  const romanization = getRomanization(word, dialect)
  const romanLabel = getRomanizationLabel(dialect)

  if (dialect === 'cantonese') {
    if (mode === 1 || stage === 1) {
      return { tag: 'English', english: word.english }
    }
    return { tag: 'Character', char: word.char, pinyin: romanization }
  }

  if (mode === 1 || stage === 2) {
    return { tag: 'English', english: word.english }
  }
  if (stage === 1) {
    return { tag: romanLabel, pinyin: word.pinyin, pinyinLarge: true }
  }
  return { tag: 'Character', char: word.char, pinyin: word.pinyin }
}
