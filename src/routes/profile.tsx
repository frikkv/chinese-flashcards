import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { hsk1Words, hsk2Words, lang1511Units } from '../data/vocabulary'
import type { Word } from '../data/vocabulary'

export const Route = createFileRoute('/profile')({ component: ProfilePage })

// ── TYPES ─────────────────────────────────────────────────────────
type ProgressCard = {
  cardId: string
  timesCorrect: number
  timesAttempted: number
  lastSeenAt: Date
}

type MasteryStats = {
  new: number
  learning: number
  known: number
  total: number
  accuracy: number | null
  totalReviews: number
  hardest: string[]
  recentlyMastered: string[]
}

// ── MASTERY HELPER ─────────────────────────────────────────────────
// Known: ≥3 correct AND ≥80% accuracy
function computeMastery(vocab: Word[], cards: ProgressCard[]): MasteryStats {
  const map = new Map(cards.map((c) => [c.cardId, c]))
  let newCount = 0, learning = 0, known = 0
  let totalCorrect = 0, totalAttempted = 0
  const hardest: Array<{ char: string; accuracy: number }> = []
  const recentlyMastered: Array<{ char: string; lastSeenAt: Date }> = []

  for (const word of vocab) {
    const p = map.get(word.char)
    if (!p || p.timesAttempted === 0) {
      newCount++
    } else {
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
    new: newCount,
    learning,
    known,
    total: vocab.length,
    accuracy: totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : null,
    totalReviews: totalAttempted,
    hardest: hardest.slice(0, 6).map((h) => h.char),
    recentlyMastered: recentlyMastered.slice(0, 8).map((r) => r.char),
  }
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

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

// ── STAT BOX ──────────────────────────────────────────────────────
function StatBox({ num, label, color }: { num: string | number; label: string; color?: string }) {
  return (
    <div className="fc-profile-stat">
      <div className="fc-profile-stat-num" style={color ? { color } : undefined}>
        {num}
      </div>
      <div className="fc-profile-stat-label">{label}</div>
    </div>
  )
}

// ── WORD SET ROW ──────────────────────────────────────────────────
function WordSetRow({ name, stats }: { name: string; stats: MasteryStats }) {
  const knownPct = stats.total > 0 ? Math.round((stats.known / stats.total) * 100) : 0
  return (
    <div className="fc-profile-wordset-row">
      <div className="fc-profile-wordset-name">{name}</div>
      <div className="fc-profile-wordset-bar-wrap">
        <div className="fc-profile-wordset-bar">
          <div className="fc-profile-wordset-bar-fill" style={{ width: `${knownPct}%` }} />
        </div>
        <span className="fc-profile-wordset-pct">{knownPct}%</span>
      </div>
      <div className="fc-profile-wordset-chips">
        <span className="fc-profile-chip fc-profile-chip--new">{stats.new} new</span>
        <span className="fc-profile-chip fc-profile-chip--learning">{stats.learning} learning</span>
        <span className="fc-profile-chip fc-profile-chip--known">{stats.known} known</span>
        {stats.accuracy !== null && (
          <span className="fc-profile-chip fc-profile-chip--acc">{stats.accuracy}% acc</span>
        )}
      </div>
    </div>
  )
}

// ── MAIN PAGE ─────────────────────────────────────────────────────
function ProfilePage() {
  const { data: session, isPending } = authClient.useSession()
  const trpc = useTRPC()

  const profileQuery = useQuery({
    ...trpc.progress.getProfileStats.queryOptions(),
    enabled: !!session?.user,
  })

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
          <h2 className="fc-profile-noauth-title">Sign in to view your profile</h2>
          <p className="fc-profile-noauth-sub">
            Your learning statistics and progress are only available when signed in.
          </p>
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
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
          (ws.stats.accuracy ?? 101) < (worst.stats.accuracy ?? 101) ? ws : worst,
        )
      : null

  // All hardest words across all sets
  const allHardest: Array<{ char: string; acc: number }> = []
  for (const c of cards) {
    if (c.timesAttempted >= 2) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect < 3 || acc < 0.8) {
        allHardest.push({ char: c.cardId, acc })
      }
    }
  }
  allHardest.sort((a, b) => a.acc - b.acc)
  const topHardest = allHardest.slice(0, 8)

  // All recently mastered words
  const allRecentlyMastered: Array<{ char: string; lastSeenAt: Date }> = []
  for (const c of cards) {
    if (c.timesAttempted > 0) {
      const acc = c.timesCorrect / c.timesAttempted
      if (c.timesCorrect >= 3 && acc >= 0.8) {
        allRecentlyMastered.push({ char: c.cardId, lastSeenAt: c.lastSeenAt })
      }
    }
  }
  allRecentlyMastered.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  const topRecentMastered = allRecentlyMastered.slice(0, 8)

  // ── Provider display ─────────────────────────────────────────
  const providers = stats?.providers ?? []
  const providerLabel = providers.includes('google')
    ? 'Google'
    : providers.includes('credential')
      ? 'Email & Password'
      : providers[0] ?? 'Email & Password'

  const overallAccuracy =
    stats && stats.totalReviews > 0
      ? Math.round((stats.totalCorrect / stats.totalReviews) * 100)
      : null

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
            {(user.name?.charAt(0) ?? user.email?.charAt(0) ?? '?').toUpperCase()}
          </div>
          <div className="fc-profile-header-info">
            {user.name && <div className="fc-profile-name">{user.name}</div>}
            <div className="fc-profile-email">{user.email}</div>
            <div className="fc-profile-meta">
              <span>{providerLabel}</span>
              {user.createdAt && (
                <>
                  <span className="fc-profile-dot">·</span>
                  <span>Joined {formatDate(user.createdAt)}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="fc-profile-loading">
            <div className="fc-auth-spinner" />
            <span>Loading your stats…</span>
          </div>
        ) : (
          <>
            {/* ── Learning Statistics ── */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">Learning Statistics</div>
              <div className="fc-profile-stat-grid">
                <StatBox num={stats?.totalSessions ?? 0} label="Sessions" />
                <StatBox num={stats?.totalReviews ?? 0} label="Total Reviews" />
                <StatBox
                  num={allStats.known}
                  label="Words Known"
                  color="#27ae60"
                />
                <StatBox
                  num={overallAccuracy !== null ? `${overallAccuracy}%` : '—'}
                  label="Overall Accuracy"
                />
                <StatBox
                  num={stats?.streak ?? 0}
                  label="Day Streak"
                  color={(stats?.streak ?? 0) > 0 ? '#e67e22' : undefined}
                />
                <StatBox num={stats?.bestStreak ?? 0} label="Best Streak" />
                <StatBox num={stats?.thisWeekSessions ?? 0} label="Sessions This Week" />
                {stats?.lastSession && (
                  <StatBox
                    num={formatWordSetKey(
                      stats.lastSession.wordSetKey,
                      stats.lastSession.wordSetDetail,
                    )}
                    label="Last Studied"
                  />
                )}
              </div>
            </div>

            {/* ── Progress by Word Set ── */}
            <div className="fc-profile-section">
              <div className="fc-profile-section-title">Progress by Word Set</div>

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
            {(topHardest.length > 0 ||
              topRecentMastered.length > 0 ||
              strongest ||
              weakest) && (
              <div className="fc-profile-section">
                <div className="fc-profile-section-title">Performance Insights</div>

                <div className="fc-profile-insights-grid">
                  {/* Strongest / weakest */}
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

                  {/* Currently struggling with */}
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

                  {/* Recently mastered */}
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
    </div>
  )
}
