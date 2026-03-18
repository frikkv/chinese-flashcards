import { describe, it, expect } from 'vitest'
import {
  computeMastery,
  formatWordSetKey,
  getHardestWords,
  getRecentlyMastered,
} from '#/lib/mastery'
import type { ProgressCard } from '#/lib/mastery'
import type { Word } from '#/data/vocabulary'

// ── Fixtures ──────────────────────────────────────────────────────

const w = (char: string, pinyin: string, english: string): Word => ({
  char,
  pinyin,
  english,
})

const card = (
  cardId: string,
  correct: number,
  attempted: number,
  daysAgo = 0,
): ProgressCard => ({
  cardId,
  timesCorrect: correct,
  timesAttempted: attempted,
  lastSeenAt: new Date(Date.now() - daysAgo * 86400000),
})

const VOCAB: Word[] = [
  w('你', 'nǐ', 'You'),
  w('好', 'hǎo', 'Good'),
  w('我', 'wǒ', 'I/Me'),
  w('是', 'shì', 'Is/Am/Are'),
  w('学', 'xué', 'Study'),
]

// ── formatWordSetKey ──────────────────────────────────────────────

describe('formatWordSetKey', () => {
  it('formats HSK levels', () => {
    expect(formatWordSetKey('hsk', '1')).toBe('HSK 1')
    expect(formatWordSetKey('hsk', '1,2')).toBe('HSK 1 + 2')
  })

  it('formats LANG 1511 single unit', () => {
    expect(formatWordSetKey('lang1511', '3')).toBe('LANG 1511 · Unit 3')
  })

  it('formats LANG 1511 multiple units', () => {
    expect(formatWordSetKey('lang1511', '1,2,5')).toBe(
      'LANG 1511 · Units 1, 2, 5',
    )
  })

  it('returns key as-is for unknown types', () => {
    expect(formatWordSetKey('custom', 'abc')).toBe('custom')
  })

  it('filters empty segments from detail', () => {
    expect(formatWordSetKey('hsk', ',1,,2,')).toBe('HSK 1 + 2')
    expect(formatWordSetKey('lang1511', ',3,')).toBe('LANG 1511 · Unit 3')
  })

  it('handles empty detail', () => {
    expect(formatWordSetKey('hsk', '')).toBe('HSK ')
  })
})

// ── getHardestWords ───────────────────────────────────────────────

describe('getHardestWords', () => {
  it('returns empty for no cards', () => {
    expect(getHardestWords([])).toEqual([])
  })

  it('excludes cards with fewer than 2 attempts', () => {
    const cards = [card('你', 0, 1)]
    expect(getHardestWords(cards)).toEqual([])
  })

  it('excludes mastered cards (>=3 correct AND >=80%)', () => {
    const cards = [card('你', 4, 5)] // 80% + >=3 correct
    expect(getHardestWords(cards)).toEqual([])
  })

  it('includes cards with <3 correct even if accuracy is high', () => {
    const cards = [card('你', 2, 2)] // 100% but only 2 correct
    expect(getHardestWords(cards)).toEqual([{ char: '你', acc: 1 }])
  })

  it('includes cards with >=3 correct but <80% accuracy', () => {
    const cards = [card('你', 3, 5)] // 60% accuracy
    expect(getHardestWords(cards)).toEqual([{ char: '你', acc: 0.6 }])
  })

  it('sorts by accuracy ascending (worst first)', () => {
    const cards = [
      card('好', 1, 4), // 25%
      card('你', 1, 2), // 50%
      card('我', 1, 3), // 33%
    ]
    const result = getHardestWords(cards)
    expect(result.map((r) => r.char)).toEqual(['好', '我', '你'])
  })

  it('respects the limit parameter', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`w${i}`, 1, 5, i),
    )
    expect(getHardestWords(cards, 3)).toHaveLength(3)
  })

  it('defaults to limit of 8', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`w${i}`, 1, 5, i),
    )
    expect(getHardestWords(cards)).toHaveLength(8)
  })
})

// ── getRecentlyMastered ───────────────────────────────────────────

describe('getRecentlyMastered', () => {
  it('returns empty for no cards', () => {
    expect(getRecentlyMastered([])).toEqual([])
  })

  it('excludes cards with 0 attempts', () => {
    const cards = [card('你', 0, 0)]
    expect(getRecentlyMastered(cards)).toEqual([])
  })

  it('excludes cards that are not mastered', () => {
    const cards = [card('你', 2, 5)] // <3 correct
    expect(getRecentlyMastered(cards)).toEqual([])
  })

  it('includes mastered cards (>=3 correct AND >=80%)', () => {
    const cards = [card('你', 4, 5)] // 80%
    expect(getRecentlyMastered(cards)).toEqual([{ char: '你' }])
  })

  it('excludes cards at exactly 3 correct but below 80%', () => {
    const cards = [card('你', 3, 5)] // 60%
    expect(getRecentlyMastered(cards)).toEqual([])
  })

  it('sorts by lastSeenAt descending (most recent first)', () => {
    const cards = [
      card('好', 3, 3, 3), // 3 days ago
      card('你', 4, 4, 1), // 1 day ago
      card('我', 5, 5, 2), // 2 days ago
    ]
    const result = getRecentlyMastered(cards)
    expect(result.map((r) => r.char)).toEqual(['你', '我', '好'])
  })

  it('respects the limit parameter', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`w${i}`, 5, 5, i),
    )
    expect(getRecentlyMastered(cards, 3)).toHaveLength(3)
  })

  it('defaults to limit of 8', () => {
    const cards = Array.from({ length: 20 }, (_, i) =>
      card(`w${i}`, 5, 5, i),
    )
    expect(getRecentlyMastered(cards)).toHaveLength(8)
  })
})

// ── computeMastery ────────────────────────────────────────────────

describe('computeMastery', () => {
  it('counts all words as new when no cards exist', () => {
    const stats = computeMastery(VOCAB, [])
    expect(stats.new).toBe(5)
    expect(stats.learning).toBe(0)
    expect(stats.known).toBe(0)
    expect(stats.total).toBe(5)
    expect(stats.accuracy).toBeNull()
    expect(stats.totalReviews).toBe(0)
  })

  it('counts words with 0 attempts as new', () => {
    const cards = [card('你', 0, 0)]
    const stats = computeMastery(VOCAB, cards)
    expect(stats.new).toBe(5)
  })

  it('classifies known: >=3 correct AND >=80%', () => {
    const cards = [card('你', 4, 5)] // 80%
    const stats = computeMastery(VOCAB, cards)
    expect(stats.known).toBe(1)
    expect(stats.learning).toBe(0)
    expect(stats.new).toBe(4)
  })

  it('classifies learning: attempted but not mastered', () => {
    const cards = [card('你', 1, 5)] // 20%, not mastered
    const stats = computeMastery(VOCAB, cards)
    expect(stats.learning).toBe(1)
    expect(stats.known).toBe(0)
    expect(stats.new).toBe(4)
  })

  it('computes accuracy as rounded percentage', () => {
    const cards = [
      card('你', 3, 4), // 75%
      card('好', 2, 4), // 50%
    ]
    // total: 5/8 = 62.5% → 63%
    const stats = computeMastery(VOCAB, cards)
    expect(stats.accuracy).toBe(63)
    expect(stats.totalReviews).toBe(8)
  })

  it('returns null accuracy when no reviews', () => {
    const stats = computeMastery(VOCAB, [])
    expect(stats.accuracy).toBeNull()
  })

  it('populates hardest with learning words that have >=2 attempts', () => {
    const cards = [
      card('你', 1, 5), // 20%, >=2 attempts → hardest
      card('好', 0, 1), // 0%, only 1 attempt → not in hardest
    ]
    const stats = computeMastery(VOCAB, cards)
    expect(stats.hardest).toEqual(['你'])
  })

  it('caps hardest at 6 entries', () => {
    const vocab = Array.from({ length: 10 }, (_, i) =>
      w(`w${i}`, 'p', 'e'),
    )
    const cards = vocab.map((v) => card(v.char, 1, 5))
    const stats = computeMastery(vocab, cards)
    expect(stats.hardest).toHaveLength(6)
  })

  it('populates recentlyMastered from known words', () => {
    const cards = [
      card('你', 4, 5, 1),
      card('好', 5, 5, 2),
    ]
    const stats = computeMastery(VOCAB, cards)
    expect(stats.recentlyMastered).toEqual(['你', '好'])
  })

  it('caps recentlyMastered at 8 entries', () => {
    const vocab = Array.from({ length: 12 }, (_, i) =>
      w(`w${i}`, 'p', 'e'),
    )
    const cards = vocab.map((v, i) => card(v.char, 5, 5, i))
    const stats = computeMastery(vocab, cards)
    expect(stats.recentlyMastered).toHaveLength(8)
  })

  it('ignores cards not in vocab', () => {
    const cards = [card('猫', 5, 5)] // not in VOCAB
    const stats = computeMastery(VOCAB, cards)
    expect(stats.known).toBe(0)
    expect(stats.new).toBe(5)
    expect(stats.totalReviews).toBe(0)
  })

  it('boundary: exactly 3 correct at exactly 80% is known', () => {
    // 3 correct out of 3.75 attempts would be 80%, but attempts are integers
    // 3/3 = 100% → known; 3/4 = 75% → learning
    const knownCard = [card('你', 3, 3)]
    expect(computeMastery(VOCAB, knownCard).known).toBe(1)

    const learningCard = [card('你', 3, 4)]
    expect(computeMastery(VOCAB, learningCard).known).toBe(0)
    expect(computeMastery(VOCAB, learningCard).learning).toBe(1)
  })
})
