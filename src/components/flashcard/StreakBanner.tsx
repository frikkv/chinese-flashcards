export function StreakBanner({
  streak,
  thisWeekSessions,
}: {
  streak: number
  thisWeekSessions: number
}) {
  if (streak === 0 && thisWeekSessions === 0) return null
  return (
    <div className="fc-streak-banner">
      {streak > 0 && (
        <div className="fc-streak-chip">
          <span className="fc-streak-num">{streak}</span>
          <span className="fc-streak-label">day streak</span>
        </div>
      )}
      {thisWeekSessions > 0 && (
        <div className="fc-streak-chip">
          <span className="fc-streak-num">{thisWeekSessions}</span>
          <span className="fc-streak-label">sessions this week</span>
        </div>
      )}
    </div>
  )
}
