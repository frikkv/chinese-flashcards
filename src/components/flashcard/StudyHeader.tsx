export function StudyHeader({
  current,
  total,
  pct,
  score,
}: {
  current: number
  total: number
  pct: number
  score: number
}) {
  return (
    <div className="fc-study-header">
      <div style={{ flex: 1 }}>
        <div className="fc-progress-label">
          Card {current} of {total}
        </div>
        <div className="fc-progress-bar">
          <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="fc-score-badge">
        Score: <b style={{ color: '#27ae60' }}>{score}</b>
      </div>
    </div>
  )
}
