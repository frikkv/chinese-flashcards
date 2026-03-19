import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { Skeleton } from '#/components/Skeleton'

const SLOT_COUNT = 5

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

  const entries = (lbQuery.data?.entries ?? []).slice(0, SLOT_COUNT)
  const isPending = authPending || lbQuery.isPending
  const emptySlots = isPending ? 0 : Math.max(0, SLOT_COUNT - entries.length)
  // Show the "add friends" CTA in the last slot if there are empty slots
  const showAddFriendsCta = emptySlots > 0 && !isPending

  return (
    <div className="fc-ws-lb">
      <div className="fc-ws-lb-header">
        <span className="fc-ws-lb-title">This Week</span>
        <Link to="/leaderboard" className="fc-ws-lb-fulllink">
          Full view →
        </Link>
      </div>

      {isPending &&
        Array.from({ length: SLOT_COUNT }, (_, i) => (
          <div key={i} className="fc-ws-lb-row">
            <Skeleton width={18} height={16} style={{ borderRadius: 4 }} />
            <Skeleton height={13} width="60%" style={{ borderRadius: 4 }} />
            <Skeleton height={13} width={38} style={{ borderRadius: 4 }} />
          </div>
        ))}

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

      {/* Fill remaining slots with empty dash rows */}
      {!isPending &&
        emptySlots > 0 &&
        Array.from({ length: showAddFriendsCta ? emptySlots - 1 : emptySlots }, (_, i) => {
          const slotRank = entries.length + i + 1
          return (
            <div key={`empty-${i}`} className="fc-ws-lb-row fc-ws-lb-row--empty">
              <span className="fc-ws-lb-rank">
                {slotRank === 1
                  ? '🥇'
                  : slotRank === 2
                    ? '🥈'
                    : slotRank === 3
                      ? '🥉'
                      : `#${slotRank}`}
              </span>
              <span className="fc-ws-lb-name fc-ws-lb-name--empty">—</span>
              <span className="fc-ws-lb-xp fc-ws-lb-xp--zero">—</span>
            </div>
          )
        })}

      {/* Last slot: CTA to add friends */}
      {showAddFriendsCta && (
        <Link to="/friends" className="fc-ws-lb-row fc-ws-lb-row--cta">
          <span className="fc-ws-lb-rank">
            {SLOT_COUNT <= 3
              ? ['🥇', '🥈', '🥉'][SLOT_COUNT - 1]
              : `#${SLOT_COUNT}`}
          </span>
          <span className="fc-ws-lb-cta-text">Add more friends →</span>
          <span />
        </Link>
      )}
    </div>
  )
}
