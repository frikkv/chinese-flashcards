import type { Word } from '#/data/vocabulary'
import type { ProgressCard } from '#/lib/mastery'
import { WordSetDashboard } from '#/components/flashcard/WordSetDashboard'
import { InlineLeaderboard } from '#/components/flashcard/InlineLeaderboard'
import { Skeleton } from '#/components/Skeleton'

interface RightSidebarProps {
  isSignedIn: boolean
  progressPending: boolean
  thisWeekXP: number
  lastWeekXP: number
  streak: number
  dashVocab: Word[] | null
  cardProgress?: ProgressCard[]
}

export function RightSidebar({
  isSignedIn,
  progressPending,
  thisWeekXP,
  lastWeekXP,
  streak,
  dashVocab,
  cardProgress,
}: RightSidebarProps) {
  const xpTarget = lastWeekXP > 0 ? lastWeekXP : 50
  const fillPct = Math.min(Math.round((thisWeekXP / xpTarget) * 100), 100)
  const xpHint = lastWeekXP > 0
    ? thisWeekXP >= lastWeekXP
      ? 'Matched last week! 🎉'
      : `${lastWeekXP - thisWeekXP} XP to match last week`
    : null
  const trendStatus =
    thisWeekXP > lastWeekXP ? 'climbing' :
    thisWeekXP === lastWeekXP && thisWeekXP > 0 ? 'holding' :
    null
  const tier = (() => {
    if (thisWeekXP >= 500) return 'Top 50 worldwide'
    if (thisWeekXP >= 200) return 'Top 100 worldwide'
    if (thisWeekXP >= 100) return 'Top 250 worldwide'
    if (thisWeekXP >= 50)  return 'Top 500 worldwide'
    if (thisWeekXP >= 20)  return 'Top 1000 worldwide'
    if (thisWeekXP >= 5)   return 'Top 5000 worldwide'
    return null
  })()
  const sub =
    streak >= 7 ? '🔥 Legendary streak!' :
    streak >= 3 ? '🔥 Strong momentum' :
    thisWeekXP >= 50 ? '📈 Great progress' :
    thisWeekXP > 0 ? '👍 On track' :
    'Start your week'
  const motivation =
    thisWeekXP >= lastWeekXP && lastWeekXP > 0 ? 'You\'re ahead of last week — keep it up!' :
    thisWeekXP > 0 ? 'Keep going — you\'re climbing this week\'s rankings.' :
    'Study today to start climbing this week\'s rankings.'

  return (
    <div className="fc-ws-sidebar">
      <InlineLeaderboard />
      <div className="fc-ws-weekly-placeholder">
        <div className="fc-ws-weekly-header">
          <span className="fc-ws-weekly-title">This Week</span>
          <span className="fc-ws-weekly-sub">{sub}</span>
        </div>
        {isSignedIn && (
          progressPending ? (
            <>
              {/* XP section skeleton */}
              <div className="fc-ws-weekly-section">
                <Skeleton height={10} width="28%" style={{ borderRadius: 4 }} />
                <div className="fc-ws-weekly-xp-bar-wrap">
                  <Skeleton height={5} style={{ flex: 1, borderRadius: 99 }} />
                  <Skeleton height={11} width={52} style={{ borderRadius: 4 }} />
                </div>
              </div>
              {/* Streak/rank section skeleton */}
              <div className="fc-ws-weekly-section">
                <div className="fc-ws-weekly-rank-row">
                  <Skeleton height={10} width="24%" style={{ borderRadius: 4 }} />
                  <Skeleton height={11} width="38%" style={{ borderRadius: 4 }} />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* XP section */}
              <div className="fc-ws-weekly-section">
                <span className="fc-ws-weekly-section-label">⚡ XP</span>
                <div className="fc-ws-weekly-xp-bar-wrap">
                  <div className="fc-ws-weekly-xp-bar">
                    <div className="fc-ws-weekly-xp-bar-fill" style={{ width: `${fillPct}%` }} />
                  </div>
                  <span className="fc-ws-weekly-xp-nums">{thisWeekXP} / {xpTarget} XP</span>
                </div>
                {xpHint && <span className="fc-ws-weekly-xp-hint">{xpHint}</span>}
              </div>
              {/* Streak section */}
              {streak > 0 && (
                <div className="fc-ws-weekly-section">
                  <div className="fc-ws-weekly-rank-row">
                    <span className="fc-ws-weekly-section-label">🔥 Streak</span>
                    <span className="fc-ws-weekly-streak-val">{streak} day{streak !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}
              {/* Rank section */}
              {tier && (
                <div className="fc-ws-weekly-section">
                  <div className="fc-ws-weekly-rank-row">
                    <span className="fc-ws-weekly-section-label">🏆 Rank</span>
                    <span className="fc-ws-weekly-rank-label">🌍 {tier}</span>
                    {trendStatus && <span className="fc-ws-weekly-rank-status">{trendStatus}</span>}
                  </div>
                </div>
              )}
            </>
          )
        )}
        <div className="fc-ws-weekly-motivation">{motivation}</div>
      </div>
      <div className="fc-ws-progress-placeholder">
        {dashVocab && cardProgress && (
          <WordSetDashboard vocab={dashVocab} cardProgress={cardProgress} />
        )}
      </div>
    </div>
  )
}
