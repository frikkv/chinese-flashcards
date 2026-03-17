export function SessionCompleteScreen({
  score,
  totalAttempts,
  queueLength,
  onStudyAgain,
  onBack,
}: {
  score: number
  totalAttempts: number
  queueLength: number
  onStudyAgain: () => void
  onBack: () => void
}) {
  const finalPct = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0
  return (
    <div className="fc-app">
      <div className="fc-results-container">
        <div className="fc-results-char">好！</div>
        <div>
          <div className="fc-results-title">Session Complete</div>
          <div className="fc-results-sub">
            You practiced {queueLength} word{queueLength !== 1 ? 's' : ''} ·{' '}
            {finalPct}% accuracy
          </div>
        </div>
        <div className="fc-results-grid">
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#27ae60' }}>
              {score}
            </div>
            <div className="fc-result-label">Correct</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num" style={{ color: '#e74c3c' }}>
              {totalAttempts - score}
            </div>
            <div className="fc-result-label">Incorrect</div>
          </div>
          <div className="fc-result-stat">
            <div className="fc-result-num">{finalPct}%</div>
            <div className="fc-result-label">Accuracy</div>
          </div>
        </div>
        <div className="fc-results-actions">
          <button className="fc-start-btn" onClick={onStudyAgain}>
            Study Again
          </button>
          <button className="fc-results-btn" onClick={onBack}>
            Home
          </button>
        </div>
      </div>
    </div>
  )
}
