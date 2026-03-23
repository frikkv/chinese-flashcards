import { createFileRoute, Link } from '@tanstack/react-router'
import { AppHeader } from '#/components/AppHeader'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardPage,
})

// ── HELPERS ───────────────────────────────────────────────────────

function formatWeekRange(weekStartIso: string): string {
  const start = new Date(weekStartIso)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
  return `${fmt(start)} – ${fmt(end)} UTC`
}

function formatXP(xp: number): string {
  if (xp >= 1000) return `${(xp / 1000).toFixed(1)}k`
  return String(xp)
}

type Entry = {
  userId: string
  username: string | null
  displayName: string
  isMe: boolean
  xp: number
  correctAnswers: number
  sessions: number
  cardsReviewed: number
  lastActiveAt: Date | null
  rank: number
}

// ── MEDAL ─────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <span className="fc-lb-medal fc-lb-medal--gold">1</span>
  if (rank === 2)
    return <span className="fc-lb-medal fc-lb-medal--silver">2</span>
  if (rank === 3)
    return <span className="fc-lb-medal fc-lb-medal--bronze">3</span>
  return <span className="fc-lb-rank">#{rank}</span>
}

// ── ROW ───────────────────────────────────────────────────────────

function LeaderboardRow({ entry }: { entry: Entry }) {
  const initial = (entry.displayName[0] ?? '?').toUpperCase()

  return (
    <div
      className={`fc-lb-row${entry.isMe ? ' fc-lb-row--me' : ''}${entry.rank <= 3 ? ` fc-lb-row--top${entry.rank}` : ''}`}
    >
      <div className="fc-lb-row-rank">
        <RankBadge rank={entry.rank} />
      </div>

      <div
        className={`fc-lb-avatar${entry.rank === 1 ? ' fc-lb-avatar--gold' : ''}`}
      >
        {initial}
      </div>

      <div className="fc-lb-row-identity">
        <div className="fc-lb-row-name">
          {entry.displayName}
          {entry.isMe && <span className="fc-lb-you-tag">You</span>}
        </div>
        {entry.username && (
          <div className="fc-lb-row-handle">
            <Link
              to="/u/$username"
              params={{ username: entry.username }}
              className="fc-lb-handle-link"
            >
              @{entry.username}
            </Link>
          </div>
        )}
      </div>

      <div className="fc-lb-row-stats">
        <div className={`fc-lb-xp${entry.xp === 0 ? ' fc-lb-xp--zero' : ''}`}>
          {entry.xp === 0 ? '—' : `${formatXP(entry.xp)} XP`}
        </div>
        {entry.xp > 0 && (
          <div className="fc-lb-substats">
            {entry.sessions > 0 && (
              <span>
                {entry.sessions} {entry.sessions === 1 ? 'session' : 'sessions'}
              </span>
            )}
            {entry.cardsReviewed > 0 && (
              <span>{entry.cardsReviewed} cards</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── PAGE ──────────────────────────────────────────────────────────

function LeaderboardPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const trpc = useTRPC()

  const lbQuery = useQuery({
    ...trpc.social.getWeeklyLeaderboard.queryOptions(),
    enabled: !!session?.user,
    staleTime: 60_000, // treat as fresh for 1 min
  })

  if (sessionPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (!session?.user) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">榜</div>
          <h2 className="fc-profile-noauth-title">
            Sign in to see the leaderboard
          </h2>
          <p className="fc-profile-noauth-sub">
            Compete with friends and track your weekly progress.
          </p>
          <Link
            to="/"
            className="fc-start-btn"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            ← Back to flashcards
          </Link>
        </div>
      </div>
    )
  }

  const data = lbQuery.data
  const entries = (data?.entries ?? []) as Entry[]
  const myEntry = entries.find((e) => e.isMe)
  const hasFriends = data?.hasFriends ?? false
  const hasAnyActivity = entries.some((e) => e.xp > 0)
  const weekRange = data?.weekStart ? formatWeekRange(data.weekStart) : ''

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-lb-container">

        {/* Header */}
        <div className="fc-lb-header">
          <h1 className="fc-lb-title">Weekly Leaderboard</h1>
          {/* always rendered so header height is stable while data loads */}
          <div className="fc-lb-subtitle" style={{ minHeight: '1.4em' }}>
            {weekRange ? `This Week · ${weekRange}` : ''}
          </div>
        </div>

        {/* Loading — skeleton rows match final leaderboard layout */}
        {lbQuery.isPending && (
          <div className="fc-lb-list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="fc-lb-row">
                <div className="fc-lb-row-rank">
                  <Skeleton width={28} height={28} circle />
                </div>
                <Skeleton width={36} height={36} circle />
                <div className="fc-lb-row-identity">
                  <Skeleton height={13} width="58%" />
                  <Skeleton height={10} width="32%" style={{ marginTop: 5 }} />
                </div>
                <div className="fc-lb-row-stats">
                  <Skeleton
                    height={16}
                    width={56}
                    style={{ marginLeft: 'auto' }}
                  />
                  <Skeleton
                    height={10}
                    width={72}
                    style={{ marginTop: 5, marginLeft: 'auto' }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No friends empty state */}
        {!lbQuery.isPending && !hasFriends && (
          <div className="fc-lb-empty">
            <div className="fc-lb-empty-char">友</div>
            <div className="fc-lb-empty-title">
              No friends on the leaderboard yet
            </div>
            <div className="fc-lb-empty-sub">
              Add friends to compete each week and see how you stack up.
            </div>
            <Link to="/friends" className="fc-lb-empty-btn">
              Find Friends
            </Link>
          </div>
        )}

        {/* Has friends, no activity yet */}
        {!lbQuery.isPending && hasFriends && !hasAnyActivity && (
          <>
            <div className="fc-lb-empty">
              <div className="fc-lb-empty-char">零</div>
              <div className="fc-lb-empty-title">
                No study activity yet this week
              </div>
              <div className="fc-lb-empty-sub">
                Be the first to earn XP — start a study session now!
              </div>
              <Link to="/" className="fc-lb-empty-btn">
                Start Studying
              </Link>
            </div>
            {/* Still show the list so users can see their friends */}
            <div className="fc-lb-list">
              {entries.map((entry) => (
                <LeaderboardRow key={entry.userId} entry={entry} />
              ))}
            </div>
          </>
        )}

        {/* Normal state — at least one person has XP */}
        {!lbQuery.isPending && hasFriends && hasAnyActivity && (
          <>
            {/* Your rank callout — only show if not already in top 3 */}
            {myEntry && myEntry.rank > 3 && (
              <div className="fc-lb-my-rank">
                <span className="fc-lb-my-rank-label">Your Rank</span>
                <span className="fc-lb-my-rank-num">#{myEntry.rank}</span>
                <span className="fc-lb-my-rank-xp">
                  {formatXP(myEntry.xp)} XP this week
                </span>
              </div>
            )}

            <div className="fc-lb-list">
              {entries.map((entry) => (
                <LeaderboardRow key={entry.userId} entry={entry} />
              ))}
            </div>
          </>
        )}

        {/* Error */}
        {lbQuery.isError && (
          <div className="fc-lb-empty">
            <div className="fc-lb-empty-title">Could not load leaderboard</div>
            <div className="fc-lb-empty-sub">
              Please try refreshing the page.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
