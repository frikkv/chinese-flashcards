import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, useRef, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { hsk1Words, hsk2Words, lang1511Units } from '../data/vocabulary'
import { computeXP, getLevelInfo } from '#/lib/levels'
import type { ProgressCard } from '#/lib/mastery'
import { computeMastery, formatWordSetKey, getHardestWords, getRecentlyMastered } from '#/lib/mastery'
import { Pencil } from 'lucide-react'
const FriendsModal = lazy(() =>
  import('#/components/FriendsModal').then((m) => ({
    default: m.FriendsModal,
  })),
)
import { Skeleton } from '#/components/Skeleton'
import { StatCard } from '#/components/profile/StatCard'
import { WordSetRow } from '#/components/profile/WordSetRow'
import { PerformanceInsights } from '#/components/profile/PerformanceInsights'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
function ProfilePage() {
  const { data: session, isPending } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const profileQuery = useQuery({
    ...trpc.progress.getProfileStats.queryOptions(),
    enabled: !!session?.user,
  })

  const myProfileQuery = useQuery({
    ...trpc.social.getMyProfile.queryOptions(),
    enabled: !!session?.user,
  })

  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [showFriendsModal, setShowFriendsModal] = useState(false)
  const usernameInputRef = useRef<HTMLInputElement>(null)

  const confirmUsername = useMutation(
    trpc.social.confirmUsername.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.social.getMyProfile.queryKey() })
        setEditingUsername(false)
        setUsernameError('')
      },
      onError: (e) => setUsernameError(e.message),
    }),
  )

  function startEditUsername() {
    setUsernameInput(myProfileQuery.data?.username ?? '')
    setUsernameError('')
    setEditingUsername(true)
    setTimeout(() => usernameInputRef.current?.focus(), 0)
  }

  function submitUsername(e: React.FormEvent) {
    e.preventDefault()
    const v = usernameInput.trim().toLowerCase()
    if (v.length < 2) {
      setUsernameError('At least 2 characters required.')
      return
    }
    if (!/^[a-z0-9_]+$/.test(v)) {
      setUsernameError('Only lowercase letters, numbers, and underscores.')
      return
    }
    confirmUsername.mutate({ username: v })
  }

  if (isPending) {
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
          <div className="fc-profile-noauth-char">个人</div>
          <h2 className="fc-profile-noauth-title">
            Sign in to view your profile
          </h2>
          <p className="fc-profile-noauth-sub">
            Your learning statistics and progress are only available when signed
            in.
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

  const user = session.user
  const stats = profileQuery.data
  const cards: ProgressCard[] = (stats?.cards ?? []).map((c) => ({
    cardId: c.cardId,
    timesCorrect: c.timesCorrect,
    timesAttempted: c.timesAttempted,
    lastSeenAt: new Date(c.lastSeenAt),
  }))

  // ── Per-word-set mastery ──────────────────────────────────────
  const hsk1Stats = computeMastery(hsk1Words, cards)
  const hsk2Stats = computeMastery(hsk2Words, cards)
  const hskAllWords = [...hsk1Words, ...hsk2Words]
  const hskAllStats = computeMastery(hskAllWords, cards)

  const langUnitStats = lang1511Units.map((u) => ({
    unit: u.unit,
    wordCount: u.words.length,
    stats: computeMastery(u.words, cards),
  }))
  const langAllWords = lang1511Units.flatMap((u) => u.words)
  const langAllStats = computeMastery(langAllWords, cards)

  // Combined all-sets totals
  const allWords = [...hskAllWords, ...langAllWords]
  const allStats = computeMastery(allWords, cards)

  // ── Performance insights ──────────────────────────────────────
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
          (ws.stats.accuracy ?? 101) < (worst.stats.accuracy ?? 101)
            ? ws
            : worst,
        )
      : null

  const topHardest = getHardestWords(cards)
  const topRecentMastered = getRecentlyMastered(cards)

  // ── Provider display ─────────────────────────────────────────
  const providers = stats?.providers ?? []
  const providerLabel = providers.includes('google')
    ? 'Google'
    : providers.includes('credential')
      ? 'Email & Password'
      : (providers[0] ?? 'Email & Password')

  const overallAccuracy =
    stats && stats.totalReviews > 0
      ? Math.round((stats.totalCorrect / stats.totalReviews) * 100)
      : null

  const allTimeXP = stats
    ? computeXP(stats.totalCorrect, stats.totalSessions)
    : null
  const levelInfo = allTimeXP !== null ? getLevelInfo(allTimeXP) : null

  const isLoading = profileQuery.isPending

  return (
    <div className="fc-app">
      <div className="fc-profile-container">
        {/* Back link */}
        <Link to="/" className="fc-back-btn" style={{ textDecoration: 'none' }}>
          ← Home
        </Link>

        {/* Header */}
        <div className="fc-profile-header">
          <div className="fc-profile-avatar">
            {(
              user.name?.charAt(0) ??
              user.email?.charAt(0) ??
              '?'
            ).toUpperCase()}
          </div>
          <div className="fc-profile-header-info">
            <div className="fc-profile-name-row">
              {user.name && <div className="fc-profile-name">{user.name}</div>}
              {levelInfo ? (
                <span
                  className={`fc-level-badge fc-level-badge--tier${Math.ceil(levelInfo.level / 2)}`}
                >
                  Lv.{levelInfo.level} · {levelInfo.title}
                </span>
              ) : (
                <Skeleton
                  width={86}
                  height={22}
                  style={{ borderRadius: 999 }}
                />
              )}
            </div>
            <div className="fc-profile-email">{user.email}</div>
            {levelInfo && !isLoading ? (
              <div className="fc-level-progress-row">
                <div className="fc-level-progress-track">
                  <div
                    className="fc-level-progress-fill"
                    style={{
                      width: `${Math.round(levelInfo.progress * 100)}%`,
                    }}
                  />
                </div>
                <span className="fc-level-progress-label">
                  {levelInfo.isMaxLevel
                    ? `${levelInfo.xp.toLocaleString()} XP · Max level`
                    : `${levelInfo.xpIntoLevel.toLocaleString()} / ${(levelInfo.xpIntoLevel + (levelInfo.xpToNext ?? 0)).toLocaleString()} XP · ${levelInfo.xpToNext?.toLocaleString()} to Lv.${levelInfo.level + 1}`}
                </span>
              </div>
            ) : (
              <div className="fc-level-progress-row" aria-hidden="true">
                <Skeleton width={120} height={7} style={{ borderRadius: 99 }} />
                <Skeleton height={13} width={150} />
              </div>
            )}
            {myProfileQuery.isPending ? (
              <div className="fc-profile-username-row" aria-hidden="true">
                <Skeleton width={128} height={16} style={{ borderRadius: 4 }} />
              </div>
            ) : myProfileQuery.data ? (
              <div className="fc-profile-username-row">
                {editingUsername ? (
                  <form
                    className="fc-profile-username-edit-form"
                    onSubmit={submitUsername}
                  >
                    <span className="fc-profile-username-at">@</span>
                    <input
                      ref={usernameInputRef}
                      className="fc-profile-username-input"
                      value={usernameInput}
                      maxLength={30}
                      onChange={(e) => {
                        setUsernameInput(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_]/g, ''),
                        )
                        setUsernameError('')
                      }}
                    />
                    <button
                      className="fc-profile-username-save"
                      type="submit"
                      disabled={confirmUsername.isPending}
                    >
                      {confirmUsername.isPending ? '…' : 'Save'}
                    </button>
                    <button
                      className="fc-profile-username-cancel"
                      type="button"
                      onClick={() => setEditingUsername(false)}
                    >
                      Cancel
                    </button>
                    {usernameError && (
                      <span className="fc-profile-username-err">
                        {usernameError}
                      </span>
                    )}
                  </form>
                ) : (
                  <>
                    <span className="fc-profile-username">
                      @{myProfileQuery.data.username}
                    </span>
                    <button
                      className="fc-profile-username-change-btn"
                      onClick={startEditUsername}
                      aria-label="Edit username"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  </>
                )}
              </div>
            ) : null}
            <div className="fc-profile-meta">
              <span>{providerLabel}</span>
              {user.createdAt && (
                <>
                  <span className="fc-profile-dot">·</span>
                  <span>Joined {formatDate(user.createdAt)}</span>
                </>
              )}
              <span className="fc-profile-dot">·</span>
              {myProfileQuery.data && (
                <>
                  <button
                    className="fc-profile-friend-count-btn"
                    onClick={() => setShowFriendsModal(true)}
                  >
                    {myProfileQuery.data.friendCount}{' '}
                    {myProfileQuery.data.friendCount === 1
                      ? 'friend'
                      : 'friends'}
                  </button>
                  <span className="fc-profile-dot">·</span>
                  <Link
                    to="/u/$username"
                    params={{ username: myProfileQuery.data.username }}
                    style={{ color: 'var(--fc-blue)', textDecoration: 'none' }}
                  >
                    Public profile
                  </Link>
                  <span className="fc-profile-dot">·</span>
                </>
              )}
              <Link
                to="/friends"
                style={{ color: 'var(--fc-blue)', textDecoration: 'none' }}
              >
                Friends
              </Link>
              <span className="fc-profile-dot">·</span>
              <Link
                to="/leaderboard"
                style={{ color: 'var(--fc-blue)', textDecoration: 'none' }}
              >
                Leaderboard
              </Link>
            </div>
          </div>
        </div>

        {isLoading ? (
          /* Skeleton sections — mirror real layout exactly so nothing shifts on load */
          <>
            {/* Learning Statistics skeleton */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">
                <Skeleton width={140} height={10} />
              </div>
              <div className="fc-profile-stat-grid">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className={`fc-profile-stat${i === 4 ? ' fc-profile-stat--wide' : ''}`}
                  >
                    <Skeleton height={28} width="52%" />
                    <Skeleton
                      height={10}
                      width="72%"
                      style={{ marginTop: 7 }}
                    />
                    <Skeleton height={9} width="48%" style={{ marginTop: 2 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Progress by Word Set skeleton */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">
                <Skeleton width={160} height={10} />
              </div>
              <div className="fc-profile-wordset-group">
                <div className="fc-profile-wordset-group-title">
                  <Skeleton width={40} height={12} />
                </div>
                {[0, 1].map((i) => (
                  <div key={i} className="fc-profile-wordset-row">
                    <Skeleton width={56} height={12} />
                    <Skeleton height={8} style={{ borderRadius: 99 }} />
                    <Skeleton width={32} height={12} />
                  </div>
                ))}
              </div>
              <div className="fc-profile-wordset-group">
                <div className="fc-profile-wordset-group-title">
                  <Skeleton width={72} height={12} />
                </div>
                {langUnitStats.map((u) => (
                  <div key={u.unit} className="fc-profile-wordset-row">
                    <Skeleton width={56} height={12} />
                    <Skeleton height={8} style={{ borderRadius: 99 }} />
                    <Skeleton width={32} height={12} />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* ── Learning Statistics ── */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">
                Learning Statistics
              </div>
              <div className="fc-profile-stat-grid">
                {/* Sessions — sub line uses thisWeekSessions */}
                <StatCard
                  num={stats?.totalSessions ?? 0}
                  label="Sessions"
                  sub={
                    stats ? `+${stats.thisWeekSessions} this week` : undefined
                  }
                />

                {/* Total Reviews */}
                <StatCard
                  num={stats?.totalReviews ?? 0}
                  label="Total Reviews"
                  sub="All time"
                />

                {/* Words Known */}
                <StatCard
                  num={allStats.known}
                  label="Words Known"
                  sub={`${allStats.known} / ${allStats.total} total`}
                  color="var(--fc-success)"
                  tone="success"
                />

                {/* Overall Accuracy
                    TODO: last-session accuracy not stored — would need per-session breakdown
                    in userSessions table to show "Last session: X%" */}
                <StatCard
                  num={overallAccuracy !== null ? `${overallAccuracy}%` : '—'}
                  label="Accuracy"
                  sub="All time average"
                  color={
                    overallAccuracy !== null ? 'var(--fc-blue)' : undefined
                  }
                  tone={overallAccuracy !== null ? 'blue' : undefined}
                />

                {/* TODO: Active Days this week — not stored; would need a per-day session log
                    to compute distinct study days in the current week */}

                {/* Last Studied — always rendered so grid layout is stable */}
                <StatCard
                  num={
                    stats?.lastSession
                      ? formatWordSetKey(
                          stats.lastSession.wordSetKey,
                          stats.lastSession.wordSetDetail,
                        )
                      : '—'
                  }
                  label="Last Studied"
                  sub={stats?.lastSession ? 'Last activity' : 'No sessions yet'}
                  wide
                />

                {/* Day Streak — bestStreak shown as sub, absorbing the old "Best Streak" card */}
                <StatCard
                  num={stats?.streak ?? 0}
                  label="Day Streak"
                  sub={`Best: ${stats?.bestStreak ?? 0} days`}
                  color={(stats?.streak ?? 0) > 0 ? '#e67e22' : undefined}
                  tone={(stats?.streak ?? 0) > 0 ? 'streak' : undefined}
                />

                {/* Needs Review — words attempted but not yet mastered (learning state) */}
                <StatCard
                  num={allStats.learning}
                  label="Needs Review"
                  sub="Review recommended"
                  color={allStats.learning > 0 ? 'var(--fc-wrong)' : undefined}
                  tone={allStats.learning > 0 ? 'warning' : undefined}
                />
              </div>
            </div>

            {/* ── Progress by Word Set ── */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">
                Progress by Word Set
              </div>

              {/* HSK */}
              <div className="fc-profile-wordset-group">
                <div className="fc-profile-wordset-group-title">
                  HSK
                  <span className="fc-profile-wordset-group-known">
                    {hskAllStats.known}/{hskAllStats.total} known
                  </span>
                </div>
                <WordSetRow name="HSK 1" stats={hsk1Stats} />
                <WordSetRow name="HSK 2" stats={hsk2Stats} />
              </div>

              {/* LANG 1511 */}
              <div className="fc-profile-wordset-group">
                <div className="fc-profile-wordset-group-title">
                  LANG 1511
                  <span className="fc-profile-wordset-group-known">
                    {langAllStats.known}/{langAllStats.total} known
                  </span>
                </div>
                {langUnitStats.map((u) => (
                  <WordSetRow
                    key={u.unit}
                    name={`Unit ${u.unit}`}
                    stats={u.stats}
                  />
                ))}
              </div>
            </div>

            {/* ── Performance Insights ── */}
            <PerformanceInsights
              strongest={strongest}
              weakest={weakest}
              topHardest={topHardest}
              topRecentMastered={topRecentMastered}
            />
          </>
        )}

        {/* Sign out */}
        <div className="fc-profile-footer">
          <button
            className="fc-profile-signout-btn"
            onClick={() =>
              authClient.signOut({
                fetchOptions: { onSuccess: () => window.location.replace('/') },
              })
            }
          >
            Sign out
          </button>
        </div>
      </div>

      {showFriendsModal && myProfileQuery.data && (
        <Suspense fallback={null}>
          <FriendsModal
            userId={myProfileQuery.data.userId}
            displayName={user.name ?? myProfileQuery.data.username}
            onClose={() => setShowFriendsModal(false)}
          />
        </Suspense>
      )}
    </div>
  )
}
