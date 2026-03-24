import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'

export function DailyProgressCard() {
  const trpc = useTRPC()
  const { data: session } = authClient.useSession()
  const isSignedIn = !!session?.user

  const retentionQuery = useQuery({
    ...trpc.progress.getRetention.queryOptions(),
    enabled: isSignedIn,
    staleTime: 30_000,
  })

  if (!isSignedIn || !retentionQuery.data) return null

  const r = retentionQuery.data
  const pct = r.dailyGoalXp > 0 ? Math.min(Math.round((r.currentDayXp / r.dailyGoalXp) * 100), 100) : 0
  const remaining = Math.max(r.dailyGoalXp - r.currentDayXp, 0)

  return (
    <div className="fc-daily-card">
      <div className="fc-daily-top">
        <div className="fc-daily-streak">
          <span className="fc-daily-streak-fire">🔥</span>
          <span className="fc-daily-streak-num">{r.currentStreak}</span>
          <span className="fc-daily-streak-label">day{r.currentStreak !== 1 ? 's' : ''}</span>
        </div>
        {r.goalCompleted && (
          <span className="fc-daily-goal-done">Goal reached!</span>
        )}
      </div>
      <div className="fc-daily-bar-wrap">
        <div className="fc-daily-bar">
          <div
            className={`fc-daily-bar-fill${r.goalCompleted ? ' fc-daily-bar-fill--done' : ''}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="fc-daily-bar-label">
          {r.currentDayXp} / {r.dailyGoalXp} XP
        </span>
      </div>
      {!r.goalCompleted && remaining > 0 && (
        <div className="fc-daily-hint">{remaining} XP to daily goal</div>
      )}
    </div>
  )
}
