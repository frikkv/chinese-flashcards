import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { Skeleton } from '#/components/Skeleton'

export function InlineLeaderboard() {
  const trpc = useTRPC()
  const { data: authSession, isPending: authPending } = authClient.useSession()
  const isSignedIn = !!authSession?.user
  const lbQuery = useQuery({
    ...trpc.social.getWeeklyLeaderboard.queryOptions(),
    enabled: isSignedIn,
    staleTime: 60_000,
  })

  // Hide entirely once we know the user is not signed in
  if (!authPending && !isSignedIn) return null

  const allEntries = lbQuery.data?.entries ?? []
  const entries = allEntries.slice(0, 5)
  const hasMore = allEntries.length > 5
  const hasFriends = lbQuery.data?.hasFriends ?? false
  const isPending = authPending || lbQuery.isPending

  return (
    <div className="fc-ws-lb">
      <div className="fc-ws-lb-header">
        <span className="fc-ws-lb-title">This Week</span>
        <Link to="/leaderboard" className="fc-ws-lb-fulllink">
          Full view →
        </Link>
      </div>

      {isPending && (
        <div className="fc-ws-lb-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="fc-ws-lb-row">
              <Skeleton width={20} height={14} style={{ borderRadius: 4 }} />
              <Skeleton height={12} width="65%" style={{ borderRadius: 4 }} />
              <Skeleton height={12} width={36} style={{ borderRadius: 4 }} />
            </div>
          ))}
        </div>
      )}

      {!isPending && !hasFriends && (
        <div className="fc-ws-lb-empty">
          <Link to="/friends" className="fc-ws-lb-add-link">
            Add friends to compete →
          </Link>
        </div>
      )}

      {!isPending && hasFriends && entries.every((e) => e.xp === 0) && (
        <div className="fc-ws-lb-empty">No activity yet this week.</div>
      )}

      {!isPending &&
        entries.map((entry) => (
          <div
            key={entry.userId}
            className={`fc-ws-lb-row${entry.isMe ? ' fc-ws-lb-row--me' : ''}`}
          >
            <span className="fc-ws-lb-rank">
              {entry.rank === 1
                ? '🥇'
                : entry.rank === 2
                  ? '🥈'
                  : entry.rank === 3
                    ? '🥉'
                    : `#${entry.rank}`}
            </span>
            <span className="fc-ws-lb-name">
              {entry.displayName}
              {entry.isMe && <span className="fc-ws-lb-you">you</span>}
            </span>
            <span
              className={`fc-ws-lb-xp${entry.xp === 0 ? ' fc-ws-lb-xp--zero' : ''}`}
            >
              {entry.xp > 0 ? `${entry.xp} XP` : '—'}
            </span>
          </div>
        ))}

      {!isPending && hasMore && (
        <Link to="/leaderboard" className="fc-ws-lb-show-more">
          Show more →
        </Link>
      )}
    </div>
  )
}
