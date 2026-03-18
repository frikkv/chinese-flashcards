import type { Word } from '#/data/vocabulary'
import type { ProgressCard } from '#/lib/mastery'
export type { ProgressCard }

type MasteryStats = {
  new: number
  learning: number
  known: number
  total: number
  accuracy: number | null
  totalReviews: number
  hardest: string[]
}

// Known: ≥3 correct answers AND ≥80% recent accuracy
// Learning: attempted but not yet Known
// New: never attempted
export function computeWordSetMastery(
  vocab: Word[],
  cards: ProgressCard[],
): MasteryStats {
  const map = new Map(cards.map((c) => [c.cardId, c]))
  let newCount = 0,
    learning = 0,
    known = 0
  let totalCorrect = 0,
    totalAttempted = 0
  const hardest: Array<{ char: string; accuracy: number }> = []
  for (const word of vocab) {
    const p = map.get(word.char)
    if (!p || p.timesAttempted === 0) {
      newCount++
    } else {
      totalCorrect += p.timesCorrect
      totalAttempted += p.timesAttempted
      const accuracy = p.timesCorrect / p.timesAttempted
      if (p.timesCorrect >= 3 && accuracy >= 0.8) {
        known++
      } else {
        learning++
        if (p.timesAttempted >= 2) hardest.push({ char: word.char, accuracy })
      }
    }
  }
  hardest.sort((a, b) => a.accuracy - b.accuracy)
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
    hardest: hardest.slice(0, 5).map((h) => h.char),
  }
}

export function WordSetDashboard({
  vocab,
  cardProgress,
}: {
  vocab: Word[]
  cardProgress: ProgressCard[]
}) {
  const stats = computeWordSetMastery(vocab, cardProgress)
  const knownPct =
    stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0
  return (
    <div className="fc-mastery-dashboard">
      <div className="fc-mastery-header">
        <span className="fc-mastery-title">Your Progress</span>
        <span className="fc-mastery-known-label">
          {stats.known} / {stats.total} known
        </span>
      </div>
      <div className="fc-mastery-bar-wrap">
        <div className="fc-mastery-bar">
          <div
            className="fc-mastery-bar-fill"
            style={{ width: `${knownPct}%` }}
          />
        </div>
        <span className="fc-mastery-pct">{knownPct}%</span>
      </div>
      <div className="fc-mastery-chips">
        <div className="fc-mastery-chip fc-mastery-chip--new">
          <span className="fc-mastery-chip-num">{stats.new}</span>
          <span className="fc-mastery-chip-label">New</span>
        </div>
        <div className="fc-mastery-chip fc-mastery-chip--learning">
          <span className="fc-mastery-chip-num">{stats.learning}</span>
          <span className="fc-mastery-chip-label">Learning</span>
        </div>
        <div className="fc-mastery-chip fc-mastery-chip--known">
          <span className="fc-mastery-chip-num">{stats.known}</span>
          <span className="fc-mastery-chip-label">Known</span>
        </div>
      </div>
      {(stats.accuracy !== null || stats.totalReviews > 0) && (
        <div className="fc-mastery-meta">
          {stats.accuracy !== null && <span>{stats.accuracy}% accuracy</span>}
          {stats.accuracy !== null && stats.totalReviews > 0 && <span>·</span>}
          {stats.totalReviews > 0 && (
            <span>{stats.totalReviews} total reviews</span>
          )}
        </div>
      )}
      {stats.hardest.length > 0 && (
        <div className="fc-mastery-hardest">
          <span className="fc-mastery-hardest-label">Struggling with:</span>
          <div className="fc-mastery-hardest-chars">
            {stats.hardest.map((char) => (
              <span key={char} className="fc-mastery-hardest-char">
                {char}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
