import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { computeXP, getLevelInfo } from '#/lib/levels'
import { FriendsModal } from '#/components/FriendsModal'
import { hsk1Words, hsk2Words, lang1511Units } from '#/data/vocabulary'
import type { Word } from '#/data/vocabulary'

export const Route = createFileRoute('/u/$username')({ component: PublicProfilePage })

function formatWordSetKey(key: string, detail: string): string {
  if (key === 'hsk') {
    const levels = detail.split(',').filter(Boolean)
    return `HSK ${levels.join(' + ')}`
  }
  if (key === 'lang1511') {
    const units = detail.split(',').filter(Boolean)
    return `LANG 1511 · Unit${units.length > 1 ? 's' : ''} ${units.join(', ')}`
  }
  return key
}

// ── MASTERY HELPER ────────────────────────────────────────────────
type ProgressCard = {
  cardId: string
  timesCorrect: number
  timesAttempted: number
  lastSeenAt: Date
}

function computeMastery(vocab: Word[], cards: ProgressCard[]) {
  const map = new Map(cards.map((c) => [c.cardId, c]))
  let learning = 0, known = 0
  let totalCorrect = 0, totalAttempted = 0
  const hardest: Array<{ char: string; accuracy: number }> = []
  const recentlyMastered: Array<{ char: string; lastSeenAt: Date }> = []

  for (const word of vocab) {
    const p = map.get(word.char)
    if (p && p.timesAttempted > 0) {
      totalCorrect += p.timesCorrect
      totalAttempted += p.timesAttempted
      const acc = p.timesCorrect / p.timesAttempted
      if (p.timesCorrect >= 3 && acc >= 0.8) {
        known++
        recentlyMastered.push({ char: word.char, lastSeenAt: new Date(p.lastSeenAt) })
      } else {
        learning++
        if (p.timesAttempted >= 2) hardest.push({ char: word.char, accuracy: acc })
      }
    }
  }
  hardest.sort((a, b) => a.accuracy - b.accuracy)
  recentlyMastered.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())

  return {
    known,
    learning,
    total: vocab.length,
    accuracy: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : null,
    totalReviews: totalAttempted,
    hardest: hardest.slice(0, 6).map((h) => h.char),
    recentlyMastered: recentlyMastered.slice(0, 8).map((r) => r.char),
  }
}

// ── STAT CARD ─────────────────────────────────────────────────────
function StatCard({
  num,
  label,
  sub,
  color,
  tone,
  wide,
}: {
  num: string | number
  label: string
  sub?: string
  color?: string
  tone?: 'success' | 'warning' | 'streak' | 'blue'
  wide?: boolean
}) {
  const cls = [
    'fc-profile-stat',
    tone && `fc-profile-stat--${tone}`,
    wide && 'fc-profile-stat--wide',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <div className="fc-profile-stat-num" style={color ? { color } : undefined}>
        {num}
      </div>
      <div className="fc-profile-stat-label">{label}</div>
      {sub && <div className="fc-profile-stat-sub">{sub}</div>}
    </div>
  )
}

function PublicProfilePage() {
  const { username } = Route.useParams()
  const { data: session } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const profileQuery = useQuery(trpc.social.getProfile.queryOptions({ username }))
  const [showFriendsModal, setShowFriendsModal] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.social.getProfile.queryKey({ username }) })
    qc.invalidateQueries({ queryKey: trpc.social.listFriends.queryKey() })
    qc.invalidateQueries({ queryKey: trpc.social.listOutgoingRequests.queryKey() })
    qc.invalidateQueries({ queryKey: trpc.social.listIncomingRequests.queryKey() })
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
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
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
          onClick={() => cancelRequest.mutate({ friendshipId: fs.friendshipId })}
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
            onClick={() => acceptRequest.mutate({ friendshipId: fs.friendshipId })}
          >
            Accept Request
          </button>
          <button
            className="fc-social-btn fc-social-btn--secondary"
            onClick={() => declineRequest.mutate({ friendshipId: fs.friendshipId })}
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
  const langUnitStats = lang1511Units.map((u) => ({
    unit: u.unit,
    stats: computeMastery(u.words, cards),
  }))

  const wordSetOptions = [
    { name: 'HSK 1', stats: hsk1Stats },
    { name: 'HSK 2', stats: hsk2Stats },
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
          (ws.stats.accuracy ?? 101) < (worst.stats.accuracy ?? 101) ? ws : worst,
        )
      : null

  const allHardest: Array<{ char: string; acc: number }> = []
  for (const c of cards) {
    if (c.timesAttempted >= 2) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect < 3 || acc < 0.8) allHardest.push({ char: c.cardId, acc })
    }
  }
  allHardest.sort((a, b) => a.acc - b.acc)
  const topHardest = allHardest.slice(0, 8)

  const allRecentlyMastered: Array<{ char: string; lastSeenAt: Date }> = []
  for (const c of cards) {
    if (c.timesAttempted > 0) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect >= 3 && acc >= 0.8)
        allRecentlyMastered.push({ char: c.cardId, lastSeenAt: c.lastSeenAt })
    }
  }
  allRecentlyMastered.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  const topRecentMastered = allRecentlyMastered.slice(0, 8)

  const allTimeXP = computeXP(stats.totalCorrectAnswers, stats.totalSessions)
  const levelInfo = getLevelInfo(allTimeXP)

  return (
    <div className="fc-app">
      <div className="fc-profile-container">

        <Link to="/" className="fc-back-btn" style={{ textDecoration: 'none' }}>
          ← Home
        </Link>

        {/* Header */}
        <div className="fc-profile-header">
          <div className="fc-profile-avatar">
            {(profile.displayName[0] ?? '?').toUpperCase()}
          </div>
          <div className="fc-profile-header-info">
            <div className="fc-profile-name-row">
              <div className="fc-profile-name">{profile.displayName}</div>
              <span className={`fc-level-badge fc-level-badge--tier${Math.ceil(levelInfo.level / 2)}`}>
                Lv.{levelInfo.level} · {levelInfo.title}
              </span>
            </div>
            <div className="fc-profile-email">@{profile.username}</div>
            {profile.bio && <div className="fc-social-bio" style={{ marginTop: 2 }}>{profile.bio}</div>}
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
                  <span>Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
                  <span className="fc-profile-dot">·</span>
                </>
              )}
              <button className="fc-profile-friend-count-btn" onClick={() => setShowFriendsModal(true)}>
                {profile.friendCount} {profile.friendCount === 1 ? 'friend' : 'friends'}
              </button>
            </div>
          </div>
          <div className="fc-social-profile-actions">
            {fs?.status === 'friends' && (
              <span className="fc-social-badge fc-social-badge--friends" style={{ marginRight: 8 }}>Friends</span>
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
                num={formatWordSetKey(stats.lastSession.wordSetKey, stats.lastSession.wordSetDetail)}
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
        {(topHardest.length > 0 || topRecentMastered.length > 0 || strongest || weakest) && (
          <div className="fc-profile-section">
            <div className="fc-profile-section-title">Performance Insights</div>
            <div className="fc-profile-insights-grid">

              {(strongest || weakest) && (
                <div className="fc-profile-insight-card">
                  {strongest && (
                    <div className="fc-profile-insight-row">
                      <span className="fc-profile-insight-icon">🏆</span>
                      <div>
                        <div className="fc-profile-insight-label">Strongest set</div>
                        <div className="fc-profile-insight-val">
                          {strongest.name}
                          {strongest.stats.accuracy !== null && (
                            <span className="fc-profile-insight-sub">
                              {' '}· {strongest.stats.accuracy}% accuracy
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {weakest && weakest.name !== strongest?.name && (
                    <div className="fc-profile-insight-row">
                      <span className="fc-profile-insight-icon">📈</span>
                      <div>
                        <div className="fc-profile-insight-label">Needs work</div>
                        <div className="fc-profile-insight-val">
                          {weakest.name}
                          {weakest.stats.accuracy !== null && (
                            <span className="fc-profile-insight-sub">
                              {' '}· {weakest.stats.accuracy}% accuracy
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {topHardest.length > 0 && (
                <div className="fc-profile-insight-card">
                  <div className="fc-profile-insight-label" style={{ marginBottom: 10 }}>
                    Struggling with
                  </div>
                  <div className="fc-profile-char-grid">
                    {topHardest.map(({ char, acc }) => (
                      <div key={char} className="fc-profile-char-item">
                        <span className="fc-profile-char">{char}</span>
                        <span className="fc-profile-char-acc">{Math.round(acc * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {topRecentMastered.length > 0 && (
                <div className="fc-profile-insight-card">
                  <div className="fc-profile-insight-label" style={{ marginBottom: 10 }}>
                    Recently mastered
                  </div>
                  <div className="fc-profile-char-grid">
                    {topRecentMastered.map(({ char }) => (
                      <div key={char} className="fc-profile-char-item fc-profile-char-item--known">
                        <span className="fc-profile-char">{char}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

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
