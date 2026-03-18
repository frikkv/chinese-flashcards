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
