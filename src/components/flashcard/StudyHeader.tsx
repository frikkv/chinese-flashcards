export function StudyHeader({
  current,
  total,
  pct,
}: {
  current: number
  total: number
  pct: number
  score?: number
}) {
  return (
    <div className="fc-study-header">
      <div className="fc-progress-label">
        Card {current} of {total}
      </div>
      <div className="fc-progress-bar">
        <div className="fc-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
