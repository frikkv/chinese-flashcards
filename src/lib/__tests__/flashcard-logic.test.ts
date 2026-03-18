import { describe, it, expect } from 'vitest'
import {
  shuffle,
  normalizeAnswer,
  stripTones,
  getSyllableTone,
  applyToneToSyllable,
  buildToneChoices,
  buildQueue,
  getQuestionContent,
  getAnswerContent,
} from '#/lib/flashcard-logic'
import type { Word } from '#/data/vocabulary'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const w = (char: string, pinyin: string, english: string, jyutping?: string): Word =>
  ({ char, pinyin, english, ...(jyutping ? { jyutping } : {}) })

const VOCAB: Word[] = [
  w('你', 'nǐ', 'You'),
  w('好', 'hǎo', 'Good'),
  w('我', 'wǒ', 'I/Me'),
  w('是', 'shì', 'Is/Am/Are'),
  w('学', 'xué', 'Study'),
]

// ── shuffle ───────────────────────────────────────────────────────────────────

describe('shuffle', () => {
  it('returns the same elements', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = shuffle(arr)
    expect(result).toHaveLength(arr.length)
    expect([...result].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b))
  })

  it('does not mutate the input array', () => {
    const arr = [1, 2, 3]
    const copy = [...arr]
    shuffle(arr)
    expect(arr).toEqual(copy)
  })

  it('returns a new array reference', () => {
    const arr = [1, 2, 3]
    expect(shuffle(arr)).not.toBe(arr)
  })
})

// ── normalizeAnswer ───────────────────────────────────────────────────────────

describe('normalizeAnswer', () => {
  it('strips tone diacritics for all four tones across vowels', () => {
    expect(normalizeAnswer('māo')).toBe('mao')
    expect(normalizeAnswer('máo')).toBe('mao')
    expect(normalizeAnswer('mǎo')).toBe('mao')
    expect(normalizeAnswer('mào')).toBe('mao')

    expect(normalizeAnswer('tēng')).toBe('teng')
    expect(normalizeAnswer('níu')).toBe('niu')
    expect(normalizeAnswer('dōng')).toBe('dong')
    expect(normalizeAnswer('shū')).toBe('shu')
  })

  it('lowercases the result', () => {
    expect(normalizeAnswer('NI')).toBe('ni')
    expect(normalizeAnswer('Hǎo')).toBe('hao')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeAnswer('  nǐ  ')).toBe('ni')
  })

  it('treats ǖ as u', () => {
    expect(normalizeAnswer('lǖ')).toBe('lu')
  })
})

// ── stripTones ────────────────────────────────────────────────────────────────

describe('stripTones', () => {
  it('removes tone marks from a/e/i/o/u', () => {
    expect(stripTones('pīnyīn')).toBe('pinyin')
    expect(stripTones('nǐ hǎo')).toBe('ni hao')
    expect(stripTones('bàba')).toBe('baba')
  })

  it('maps all ü-tone variants to plain ü', () => {
    expect(stripTones('lǖ')).toBe('lü')  // tone 1
    expect(stripTones('lǘ')).toBe('lü')  // tone 2
    expect(stripTones('lǚ')).toBe('lü')  // tone 3
    expect(stripTones('lǜ')).toBe('lü')  // tone 4
  })

  it('leaves tone-less text unchanged', () => {
    expect(stripTones('hello')).toBe('hello')
    expect(stripTones('ni hao')).toBe('ni hao')
  })
})

// ── getSyllableTone ───────────────────────────────────────────────────────────

describe('getSyllableTone', () => {
  it('detects tone 1 (macron)', () => {
    expect(getSyllableTone('māo')).toBe(1)
    expect(getSyllableTone('tā')).toBe(1)
  })

  it('detects tone 2 (acute)', () => {
    expect(getSyllableTone('máo')).toBe(2)
    expect(getSyllableTone('ní')).toBe(2)
  })

  it('detects tone 3 (caron)', () => {
    expect(getSyllableTone('mǎo')).toBe(3)
    expect(getSyllableTone('nǐ')).toBe(3)
  })

  it('detects tone 4 (grave)', () => {
    expect(getSyllableTone('mào')).toBe(4)
    expect(getSyllableTone('shì')).toBe(4)
  })

  it('returns 0 for neutral/no tone', () => {
    expect(getSyllableTone('ma')).toBe(0)
    expect(getSyllableTone('de')).toBe(0)
  })
})

// ── applyToneToSyllable ───────────────────────────────────────────────────────

describe('applyToneToSyllable', () => {
  it('applies tone 1 to a simple syllable', () => {
    expect(applyToneToSyllable('ni', 1)).toBe('nī')
    expect(applyToneToSyllable('ma', 1)).toBe('mā')
  })

  it('applies tone 4 to u syllable', () => {
    expect(applyToneToSyllable('shu', 4)).toBe('shù')
  })

  it('returns the syllable unchanged for tone 0', () => {
    expect(applyToneToSyllable('ma', 0)).toBe('ma')
    expect(applyToneToSyllable('ni', 0)).toBe('ni')
  })

  it('always places mark on "a" or "e" first (tonation rules)', () => {
    // "hao" → tone mark goes on "a"
    expect(applyToneToSyllable('hao', 3)).toBe('hǎo')
    // "mei" → "e" takes the mark
    expect(applyToneToSyllable('mei', 2)).toBe('méi')
  })

  it('handles "ou": mark goes on "o"', () => {
    expect(applyToneToSyllable('ou', 4)).toBe('òu')
  })
})

// ── buildQueue ────────────────────────────────────────────────────────────────

describe('buildQueue', () => {
  it('mode 1: all stage 1 cards, one per word', () => {
    const q = buildQueue(VOCAB, 1, 5)
    expect(q).toHaveLength(5)
    expect(q.every((item) => item.stage === 1)).toBe(true)
  })

  it('mode 2: stage 1 + stage 2 for each word', () => {
    const q = buildQueue(VOCAB, 2, 5)
    expect(q).toHaveLength(10) // 5 words × 2 stages
    expect(q.filter((i) => i.stage === 1)).toHaveLength(5)
    expect(q.filter((i) => i.stage === 2)).toHaveLength(5)
  })

  it('mode 3: stage 1+2 pairs plus stage 3 recall cards', () => {
    const q = buildQueue(VOCAB, 3, 5)
    expect(q).toHaveLength(15) // 5×2 study + 5×1 recall
    expect(q.filter((i) => i.stage === 3)).toHaveLength(5)
  })

  it('respects session size', () => {
    const q = buildQueue(VOCAB, 1, 3)
    expect(q).toHaveLength(3)
    const uniqueChars = new Set(q.map((i) => i.word.char))
    expect(uniqueChars.size).toBe(3)
  })

  it('caps at vocab length when size exceeds vocab', () => {
    const q = buildQueue(VOCAB, 1, 100)
    expect(q).toHaveLength(VOCAB.length)
  })

  it('all words come from the provided vocab', () => {
    const chars = new Set(VOCAB.map((v) => v.char))
    buildQueue(VOCAB, 3, 5).forEach((item) => {
      expect(chars.has(item.word.char)).toBe(true)
    })
  })

  it('cantonese mode 1: stage 1 only', () => {
    const cantVocab = VOCAB.map((v) => ({ ...v, jyutping: 'nei5' }))
    const q = buildQueue(cantVocab, 1, 5, 'cantonese')
    expect(q.every((i) => i.stage === 1)).toBe(true)
    expect(q).toHaveLength(5)
  })

  it('mode 3: recall for a word never immediately follows its own pair', () => {
    // Run many times to catch probabilistic violations
    for (let run = 0; run < 20; run++) {
      const q = buildQueue(VOCAB, 3, 5)
      for (let i = 0; i < q.length; i++) {
        const item = q[i]!
        if (item.stage === 3) {
          const prev = q[i - 1]
          // Recall should not immediately follow stage 2 of same word
          expect(prev?.word !== item.word || prev?.stage !== 2).toBe(true)
        }
      }
    }
  })
})

// ── getQuestionContent ────────────────────────────────────────────────────────

describe('getQuestionContent', () => {
  const ni = w('你', 'nǐ', 'You')

  it('mode 1, stage 1: char + pinyin prompt', () => {
    const c = getQuestionContent(ni, 1, 1)
    expect(c.char).toBe('你')
    expect(c.pinyin).toBe('nǐ')
    expect(c.english).toBeUndefined()
  })

  it('mode 2, stage 1: char only (asking for pinyin)', () => {
    const c = getQuestionContent(ni, 1, 2)
    expect(c.char).toBe('你')
    expect(c.pinyin).toBeUndefined()
    expect(c.tag).toMatch(/pinyin/i)
  })

  it('mode 2, stage 2: char + pinyin (asking for English)', () => {
    const c = getQuestionContent(ni, 2, 2)
    expect(c.char).toBe('你')
    expect(c.pinyin).toBe('nǐ')
    expect(c.english).toBeUndefined()
  })

  it('mode 3, stage 3: recall prompt (English shown)', () => {
    const c = getQuestionContent(ni, 3, 3)
    expect(c.english).toBe('You')
    expect(c.isRecall).toBe(true)
    expect(c.char).toBeUndefined()
  })

  it('cantonese mode 1: uses jyutping in prompt', () => {
    const cantWord = w('你', 'nǐ', 'You', 'nei5')
    const c = getQuestionContent(cantWord, 1, 1, 'cantonese')
    expect(c.pinyin).toBe('nei5') // getRomanization returns jyutping for cantonese
  })
})

// ── getAnswerContent ──────────────────────────────────────────────────────────

describe('getAnswerContent', () => {
  const ni = w('你', 'nǐ', 'You')

  it('mode 1, stage 1: English answer', () => {
    const c = getAnswerContent(ni, 1, 1)
    expect(c.english).toBe('You')
    expect(c.tag).toBe('English')
  })

  it('mode 2, stage 1: pinyin answer (large)', () => {
    const c = getAnswerContent(ni, 1, 2)
    expect(c.pinyin).toBe('nǐ')
    expect(c.pinyinLarge).toBe(true)
    expect(c.tag).toBe('Pinyin')
  })

  it('mode 2, stage 2: English answer', () => {
    const c = getAnswerContent(ni, 2, 2)
    expect(c.english).toBe('You')
    expect(c.tag).toBe('English')
  })

  it('mode 3, stage 3: character + pinyin answer', () => {
    const c = getAnswerContent(ni, 3, 3)
    expect(c.char).toBe('你')
    expect(c.pinyin).toBe('nǐ')
    expect(c.tag).toBe('Character')
  })

  it('cantonese mode 1: English answer', () => {
    const cantWord = w('你', 'nǐ', 'You', 'nei5')
    const c = getAnswerContent(cantWord, 1, 1, 'cantonese')
    expect(c.english).toBe('You')
    expect(c.tag).toBe('English')
  })
})

// ── buildToneChoices ──────────────────────────────────────────────────────────

describe('buildToneChoices', () => {
  const ni = w('你', 'nǐ', 'You')

  it('returns exactly 4 choices', () => {
    expect(buildToneChoices(ni, VOCAB)).toHaveLength(4)
  })

  it('includes the correct pinyin', () => {
    expect(buildToneChoices(ni, VOCAB)).toContain('nǐ')
  })

  it('all choices are non-empty strings', () => {
    buildToneChoices(ni, VOCAB).forEach((c) => {
      expect(typeof c).toBe('string')
      expect(c.length).toBeGreaterThan(0)
    })
  })

  it('all choices are distinct', () => {
    const choices = buildToneChoices(ni, VOCAB)
    expect(new Set(choices).size).toBe(4)
  })

  it('works for multi-syllable words', () => {
    const pipa = w('琵琶', 'pí pá', 'Pipa (instrument)')
    // Extend vocab to ensure 3 distractors can be generated
    const bigVocab = [
      pipa,
      w('苹果', 'píng guǒ', 'Apple'),
      w('你好', 'nǐ hǎo', 'Hello'),
      w('中国', 'zhōng guó', 'China'),
      w('学生', 'xué sheng', 'Student'),
    ]
    const choices = buildToneChoices(pipa, bigVocab)
    expect(choices).toHaveLength(4)
    expect(choices).toContain('pí pá')
  })
})
