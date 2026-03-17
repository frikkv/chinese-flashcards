import type { Word } from '#/data/vocabulary'
import { type ProgressCard, computeWordSetMastery } from './WordSetDashboard'

export function ResultsPage({
  correct,
  wrong,
  pct,
  words,
  vocab,
  cardProgress,
  streak,
  onStudyAgain,
  onHome,
}: {
  correct: number
  wrong: number
  pct: number
  words: number
  vocab?: Word[]
  cardProgress?: ProgressCard[]
  streak?: number
  onStudyAgain: () => void
  onHome: () => void
}) {
  const mastery =
    vocab && vocab.length > 0 && cardProgress
      ? computeWordSetMastery(vocab, cardProgress)
      : null
  const knownPct =
    mastery && mastery.total > 0
      ? Math.round((mastery.known / mastery.total) * 100)
      : 0

  return (
    <div className="fc-app">
      <div className="fc-results-container">
        <div className="fc-results-char">好！</div>
        <div>
          <div className="fc-results-title">Session Complete</div>
          <div className="fc-results-sub">
            You practiced {words} word{words !== 1 ? 's' : ''} · {pct}% accuracy
          </div>
        </div>
        <div className="fc-results-grid">
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#27ae60' }}>
              {correct}
            </div>
            <div className="fc-result-label">Correct</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#e74c3c' }}>
              {wrong}
            </div>
            <div className="fc-result-label">Incorrect</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num">{pct}%</div>
            <div className="fc-result-label">Accuracy</div>
          </div>
        </div>

        {mastery && (
          <div className="fc-results-mastery">
            <div className="fc-mastery-header">
              <span className="fc-mastery-title">Word Set Progress</span>
              <span className="fc-mastery-known-label">
                {mastery.known} / {mastery.total} known
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
                <span className="fc-mastery-chip-num">{mastery.new}</span>
                <span className="fc-mastery-chip-label">New</span>
              </div>
              <div className="fc-mastery-chip fc-mastery-chip--learning">
                <span className="fc-mastery-chip-num">{mastery.learning}</span>
                <span className="fc-mastery-chip-label">Learning</span>
              </div>
              <div className="fc-mastery-chip fc-mastery-chip--known">
                <span className="fc-mastery-chip-num">{mastery.known}</span>
                <span className="fc-mastery-chip-label">Known</span>
              </div>
            </div>
            {mastery.hardest.length > 0 && (
              <div className="fc-mastery-hardest">
                <span className="fc-mastery-hardest-label">Keep practising:</span>
                <div className="fc-mastery-hardest-chars">
                  {mastery.hardest.map((char) => (
                    <span key={char} className="fc-mastery-hardest-char">
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {streak !== undefined && streak > 0 && (
          <div className="fc-results-streak">
            <span className="fc-streak-num">{streak}</span>
            <span className="fc-streak-label">
              {streak === 1 ? 'day streak' : 'day streak — keep it up!'}
            </span>
          </div>
        )}

        <div className="fc-results-actions">
          <button className="fc-start-btn" onClick={onStudyAgain}>
            Study Again
          </button>
          <button className="fc-results-btn" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
