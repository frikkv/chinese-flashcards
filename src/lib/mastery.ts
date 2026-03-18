import type { Word } from '#/data/vocabulary'

export type ProgressCard = {
  cardId: string
  timesCorrect: number
  timesAttempted: number
  lastSeenAt: Date
}

export type MasteryStats = {
  new: number
  learning: number
  known: number
  total: number
  accuracy: number | null
  totalReviews: number
  hardest: string[]
  recentlyMastered: string[]
}

export function formatWordSetKey(key: string, detail: string): string {
  if (key === 'hsk') {
    const levels = detail.split(',').filter(Boolean)
    return `HSK ${levels.join(' + ')}`
  }
  if (key === 'lang1511') {
    const units = detail.split(',').filter(Boolean)
    return `LANG 1511 · Unit${units.length > 1 ? 's' : ''} ${units.join(', ')}`
  }
  return key
}

/** Cross-set hardest words: attempted >=2 and not yet mastered, sorted by accuracy ascending. */
export function getHardestWords(
  cards: ProgressCard[],
  limit = 8,
): Array<{ char: string; acc: number }> {
  const result: Array<{ char: string; acc: number }> = []
  for (const c of cards) {
    if (c.timesAttempted >= 2) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect < 3 || acc < 0.8) {
        result.push({ char: c.cardId, acc })
      }
    }
  }
  result.sort((a, b) => a.acc - b.acc)
  return result.slice(0, limit)
}

/** Cross-set recently mastered words: >=3 correct AND >=80% accuracy, sorted by lastSeenAt descending. */
export function getRecentlyMastered(
  cards: ProgressCard[],
  limit = 8,
): Array<{ char: string }> {
  const result: Array<{ char: string; lastSeenAt: Date }> = []
  for (const c of cards) {
    if (c.timesAttempted > 0) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect >= 3 && acc >= 0.8) {
        result.push({ char: c.cardId, lastSeenAt: c.lastSeenAt })
      }
    }
  }
  result.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  return result.slice(0, limit).map((r) => ({ char: r.char }))
}

// Known: ≥3 correct AND ≥80% accuracy
export function computeMastery(vocab: Word[], cards: ProgressCard[]): MasteryStats {
  const map = new Map(cards.map((c) => [c.cardId, c]))
  let newCount = 0,
    learning = 0,
    known = 0
  let totalCorrect = 0,
    totalAttempted = 0
  const hardest: Array<{ char: string; accuracy: number }> = []
  const recentlyMastered: Array<{ char: string; lastSeenAt: Date }> = []

  for (const word of vocab) {
    const p = map.get(word.char)
    if (!p || p.timesAttempted === 0) {
      newCount++
    } else {
      totalCorrect += p.timesCorrect
      totalAttempted += p.timesAttempted
      const acc = p.timesCorrect / p.timesAttempted
      if (p.timesCorrect >= 3 && acc >= 0.8) {
        known++
        recentlyMastered.push({
          char: word.char,
          lastSeenAt: new Date(p.lastSeenAt),
        })
      } else {
        learning++
        if (p.timesAttempted >= 2)
          hardest.push({ char: word.char, accuracy: acc })
      }
    }
  }
  hardest.sort((a, b) => a.accuracy - b.accuracy)
  recentlyMastered.sort(
    (a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  )

  return {
    new: newCount,
    learning,
    known,
    total: vocab.length,
    accuracy:
      totalAttempted > 0
        ? Math.round((totalCorrect / totalAttempted) * 100)
        : null,
    totalReviews: totalAttempted,
    hardest: hardest.slice(0, 6).map((h) => h.char),
    recentlyMastered: recentlyMastered.slice(0, 8).map((r) => r.char),
  }
}
