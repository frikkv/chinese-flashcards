import { createFileRoute, Link } from '@tanstack/react-router'
import { AppHeader } from '#/components/AppHeader'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { computeXP, getLevelInfo } from '#/lib/levels'
import type { ProgressCard } from '#/lib/mastery'
import { computeMastery, formatWordSetKey, getHardestWords, getRecentlyMastered } from '#/lib/mastery'
import { FriendsModal } from '#/components/FriendsModal'
import { hsk1Words, hsk2Words, hsk3Words, hsk4Words, lang1511Units } from '#/data/vocabulary'
import { StatCard } from '#/components/profile/StatCard'
import { PerformanceInsights } from '#/components/profile/PerformanceInsights'

export const Route = createFileRoute('/u/$username')({
  component: PublicProfilePage,
})

function PublicProfilePage() {
  const { username } = Route.useParams()
  const { data: session } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const profileQuery = useQuery(
    trpc.social.getProfile.queryOptions({ username }),
  )
  const [showFriendsModal, setShowFriendsModal] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: trpc.social.getProfile.queryKey({ username }),
    })
    qc.invalidateQueries({ queryKey: trpc.social.listFriends.queryKey() })
    qc.invalidateQueries({
      queryKey: trpc.social.listOutgoingRequests.queryKey(),
    })
    qc.invalidateQueries({
      queryKey: trpc.social.listIncomingRequests.queryKey(),
    })
  }

  const sendRequest = useMutation(
    trpc.social.sendFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const cancelRequest = useMutation(
    trpc.social.cancelFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const acceptRequest = useMutation(
    trpc.social.acceptFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const declineRequest = useMutation(
    trpc.social.declineFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const removeFriend = useMutation(
    trpc.social.removeFriend.mutationOptions({ onSuccess: invalidate }),
  )

  if (profileQuery.isPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">404</div>
          <h2 className="fc-profile-noauth-title">User not found</h2>
          <p className="fc-profile-noauth-sub">@{username} doesn't exist.</p>
          <Link
            to="/"
            className="fc-start-btn"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            ← Home
          </Link>
        </div>
      </div>
    )
  }

  const profile = profileQuery.data!
  const fs = profile.friendStatus
  const isLoggedIn = !!session?.user

  function FriendButton() {
    if (!isLoggedIn || !fs) return null
    if (fs.status === 'self') return null

    if (fs.status === 'friends') {
      return (
        <button
          className="fc-social-btn fc-social-btn--danger"
          onClick={() => {
            if (confirm(`Remove ${profile.displayName} from friends?`)) {
              removeFriend.mutate({ friendshipId: fs.friendshipId })
            }
          }}
        >
          Remove Friend
        </button>
      )
    }
    if (fs.status === 'request_sent') {
      return (
        <button
          className="fc-social-btn fc-social-btn--secondary"
          onClick={() =>
            cancelRequest.mutate({ friendshipId: fs.friendshipId })
          }
        >
          Cancel Request
        </button>
      )
    }
    if (fs.status === 'request_received') {
      return (
        <>
          <button
            className="fc-social-btn fc-social-btn--primary"
            onClick={() =>
              acceptRequest.mutate({ friendshipId: fs.friendshipId })
            }
          >
            Accept Request
          </button>
          <button
            className="fc-social-btn fc-social-btn--secondary"
            onClick={() =>
              declineRequest.mutate({ friendshipId: fs.friendshipId })
            }
          >
            Decline
          </button>
        </>
      )
    }
    // not_friends
    return (
      <button
        className="fc-social-btn fc-social-btn--primary"
        onClick={() => sendRequest.mutate({ targetUserId: profile.userId })}
      >
        Add Friend
      </button>
    )
  }

  const { stats } = profile

  const cards: ProgressCard[] = stats.cards.map((c) => ({
    cardId: c.cardId,
    timesCorrect: c.timesCorrect,
    timesAttempted: c.timesAttempted,
    lastSeenAt: new Date(c.lastSeenAt),
  }))

  // Per-word-set mastery for Performance Insights
  const hsk1Stats = computeMastery(hsk1Words, cards)
  const hsk2Stats = computeMastery(hsk2Words, cards)
  const hsk3Stats = computeMastery(hsk3Words, cards)
  const hsk4Stats = computeMastery(hsk4Words, cards)
  const langUnitStats = lang1511Units.map((u) => ({
    unit: u.unit,
    stats: computeMastery(u.words, cards),
  }))

  const wordSetOptions = [
    { name: 'HSK 1', stats: hsk1Stats },
    { name: 'HSK 2', stats: hsk2Stats },
    { name: 'HSK 3', stats: hsk3Stats },
    { name: 'HSK 4', stats: hsk4Stats },
    ...langUnitStats
      .filter((l) => l.stats.totalReviews > 0)
      .map((l) => ({ name: `Unit ${l.unit}`, stats: l.stats })),
  ].filter((ws) => ws.stats.totalReviews > 0)

  const strongest =
    wordSetOptions.length > 0
      ? wordSetOptions.reduce((best, ws) =>
          (ws.stats.accuracy ?? 0) > (best.stats.accuracy ?? 0) ? ws : best,
        )
      : null
  const weakest =
    wordSetOptions.length > 1
      ? wordSetOptions.reduce((worst, ws) =>
          (ws.stats.accuracy ?? 101) < (worst.stats.accuracy ?? 101)
            ? ws
            : worst,
        )
      : null

  const topHardest = getHardestWords(cards)
  const topRecentMastered = getRecentlyMastered(cards)

  const allTimeXP = computeXP(stats.totalCorrectAnswers, stats.totalSessions)
  const levelInfo = getLevelInfo(allTimeXP)

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-profile-container">
        {/* Header */}
        <div className="fc-profile-header">
          <div className="fc-profile-avatar">
            {(profile.displayName[0] ?? '?').toUpperCase()}
          </div>
          <div className="fc-profile-header-info">
            <div className="fc-profile-name-row">
              <div className="fc-profile-name">{profile.displayName}</div>
              <span
                className={`fc-level-badge fc-level-badge--tier${Math.ceil(levelInfo.level / 2)}`}
              >
                Lv.{levelInfo.level} · {levelInfo.title}
              </span>
            </div>
            <div className="fc-profile-email">@{profile.username}</div>
            {profile.bio && (
              <div className="fc-social-bio" style={{ marginTop: 2 }}>
                {profile.bio}
              </div>
            )}
            <div className="fc-level-progress-row">
              <div className="fc-level-progress-track">
                <div
                  className="fc-level-progress-fill"
                  style={{ width: `${Math.round(levelInfo.progress * 100)}%` }}
                />
              </div>
              <span className="fc-level-progress-label">
                {levelInfo.isMaxLevel
                  ? `${levelInfo.xp.toLocaleString()} XP · Max level`
                  : `${levelInfo.xp.toLocaleString()} XP`}
              </span>
            </div>
            <div className="fc-profile-meta">
              {profile.joinedAt && (
                <>
                  <span>
                    Joined{' '}
                    {new Date(profile.joinedAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <span className="fc-profile-dot">·</span>
                </>
              )}
              <button
                className="fc-profile-friend-count-btn"
                onClick={() => setShowFriendsModal(true)}
              >
                {profile.friendCount}{' '}
                {profile.friendCount === 1 ? 'friend' : 'friends'}
              </button>
            </div>
          </div>
          <div className="fc-social-profile-actions">
            {fs?.status === 'friends' && (
              <span
                className="fc-social-badge fc-social-badge--friends"
                style={{ marginRight: 8 }}
              >
                Friends
              </span>
            )}
            <FriendButton />
          </div>
        </div>

        {/* Learning Statistics */}
        <div className="fc-profile-section">
          <div className="fc-profile-section-title">Learning Statistics</div>
          <div className="fc-profile-stat-grid">
            <StatCard
              num={stats.totalSessions}
              label="Sessions"
              sub={`+${stats.weeklySessions} this week`}
            />

            <StatCard
              num={stats.totalCardsReviewed}
              label="Total Reviews"
              sub="All time"
            />

            <StatCard
              num={stats.wordsKnown}
              label="Words Known"
              sub={`${stats.wordsKnown} / ${stats.wordsTotal} total`}
              color="var(--fc-success)"
              tone="success"
            />

            <StatCard
              num={stats.accuracy !== null ? `${stats.accuracy}%` : '—'}
              label="Accuracy"
              sub="All time average"
              color={stats.accuracy !== null ? 'var(--fc-blue)' : undefined}
              tone={stats.accuracy !== null ? 'blue' : undefined}
            />

            {stats.lastSession && (
              <StatCard
                num={formatWordSetKey(
                  stats.lastSession.wordSetKey,
                  stats.lastSession.wordSetDetail,
                )}
                label="Last Studied"
                sub="Last activity"
                wide
              />
            )}

            <StatCard
              num={stats.streak}
              label="Day Streak"
              sub={`Best: ${stats.bestStreak} days`}
              color={stats.streak > 0 ? '#e67e22' : undefined}
              tone={stats.streak > 0 ? 'streak' : undefined}
            />

            <StatCard
              num={stats.needsReview}
              label="Needs Review"
              sub="Review recommended"
              color={stats.needsReview > 0 ? 'var(--fc-wrong)' : undefined}
              tone={stats.needsReview > 0 ? 'warning' : undefined}
            />
          </div>
        </div>

        {/* Performance Insights */}
        <PerformanceInsights
          strongest={strongest}
          weakest={weakest}
          topHardest={topHardest}
          topRecentMastered={topRecentMastered}
        />
      </div>

      {showFriendsModal && (
        <FriendsModal
          userId={profile.userId}
          displayName={profile.displayName}
          onClose={() => setShowFriendsModal(false)}
        />
      )}
    </div>
  )
}
