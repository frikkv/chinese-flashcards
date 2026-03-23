import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/analytics')({
  component: AdminAnalyticsPage,
})

function AdminAnalyticsPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })

  const retentionQuery = useQuery({
    ...trpc.admin.getRetention.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const funnelQuery = useQuery({
    ...trpc.admin.getFunnel.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const ttvQuery = useQuery({
    ...trpc.admin.getTimeToValue.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const eventQuery = useQuery({
    ...trpc.admin.getEventStats.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const growthQuery = useQuery({
    ...trpc.admin.getGrowthStats.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const featureQuery = useQuery({
    ...trpc.admin.getFeatureUsage.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })

  if (authPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (!session?.user || accessQuery.isError) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">禁</div>
          <h2 className="fc-profile-noauth-title">Access denied</h2>
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

  const retention = retentionQuery.data
  const funnel = funnelQuery.data
  const ttv = ttvQuery.data
  const events = eventQuery.data
  const growth = growthQuery.data
  const features = featureQuery.data

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link active">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
        </div>

        <h1 className="fc-admin-title">Analytics</h1>

        {/* Retention */}
        <div className="fc-admin-two-col">
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Retention</h2>
            {retentionQuery.isPending ? (
              <SkeletonRows count={3} />
            ) : retention ? (
              <div className="fc-admin-list">
                <RetentionRow label="Day 1" data={retention.d1} />
                <RetentionRow label="Day 7" data={retention.d7} />
                <RetentionRow label="Day 30" data={retention.d30} />
              </div>
            ) : null}
          </div>

          {/* Time to Value */}
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Time to Value</h2>
            {ttvQuery.isPending ? (
              <SkeletonRows count={3} />
            ) : ttv ? (
              <div className="fc-admin-list">
                <TtvRow label="First study session" hours={ttv.firstStudySession} />
                <TtvRow label="First chat message" hours={ttv.firstChatMessage} />
                <TtvRow label="First custom word set" hours={ttv.firstCustomWordSet} />
              </div>
            ) : null}
          </div>
        </div>

        {/* Funnel */}
        <div className="fc-admin-section">
          <h2 className="fc-admin-section-title">Product Funnel</h2>
          {funnelQuery.isPending ? (
            <SkeletonRows count={5} />
          ) : funnel ? (
            <div className="fc-admin-funnel">
              {funnel.map((step, i) => (
                <div key={step.step} className="fc-admin-funnel-step">
                  <div className="fc-admin-funnel-bar-wrap">
                    <div
                      className="fc-admin-funnel-bar"
                      style={{ width: `${step.pct}%` }}
                    />
                  </div>
                  <div className="fc-admin-funnel-info">
                    <span className="fc-admin-funnel-label">{step.step}</span>
                    <span className="fc-admin-funnel-val">
                      {step.count.toLocaleString()}
                      {i > 0 && (
                        <span className="fc-admin-funnel-pct"> ({step.pct}%)</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Cohort Retention */}
        {retention && retention.cohorts.length > 0 && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Weekly Cohort Retention (Week 2)</h2>
            <div className="fc-admin-cohort-grid">
              {retention.cohorts.map((c) => (
                <div key={c.week} className="fc-admin-cohort-cell">
                  <div className="fc-admin-cohort-week">
                    {new Date(c.week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <div
                    className="fc-admin-cohort-bar"
                    style={{ height: `${Math.max(c.rate, 4)}%` }}
                    title={`${c.retained}/${c.size} (${c.rate}%)`}
                  />
                  <div className="fc-admin-cohort-rate">{c.rate}%</div>
                  <div className="fc-admin-cohort-size">{c.size} users</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Growth trends */}
        {growth && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Growth (14 days)</h2>
            <div className="fc-admin-charts-row">
              <MiniBarChart title="New Users" data={growth.newUsersDaily} />
              <MiniBarChart title="Active Users" data={growth.activeUsersDaily} />
              <MiniBarChart title="Sessions" data={growth.sessionsDaily} />
            </div>
          </div>
        )}

        {/* Events + Feature usage */}
        <div className="fc-admin-two-col">
          {events && events.topEvents.length > 0 && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">
                Top Events
                <span className="fc-admin-section-sub">
                  {events.totalEvents.toLocaleString()} total
                </span>
              </h2>
              <div className="fc-admin-list">
                {events.topEvents.map((e) => (
                  <div key={e.name} className="fc-admin-list-row">
                    <span className="fc-admin-list-name">{e.name}</span>
                    <span className="fc-admin-list-val">{e.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {features && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">Feature Usage</h2>
              <div className="fc-admin-list">
                {features.topModes.map((m) => (
                  <div key={m.mode} className="fc-admin-list-row">
                    <span className="fc-admin-list-name">{m.mode}</span>
                    <span className="fc-admin-list-val">{m.count.toLocaleString()} sessions</span>
                  </div>
                ))}
                <div className="fc-admin-list-row">
                  <span className="fc-admin-list-name">User chat messages</span>
                  <span className="fc-admin-list-val">{features.totalUserChatMessages.toLocaleString()}</span>
                </div>
                <div className="fc-admin-list-row">
                  <span className="fc-admin-list-name">Friendships</span>
                  <span className="fc-admin-list-val">{features.totalAcceptedFriendships.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────

function RetentionRow({ label, data }: { label: string; data: { retained: number; total: number; rate: number } }) {
  return (
    <div className="fc-admin-list-row">
      <span className="fc-admin-list-name">
        {label}
        <span className="fc-admin-list-sub"> ({data.retained}/{data.total})</span>
      </span>
      <span className={`fc-admin-retention-val${data.rate >= 30 ? ' fc-admin-retention-val--good' : ''}`}>
        {data.rate}%
      </span>
    </div>
  )
}

function TtvRow({ label, hours }: { label: string; hours: number | null }) {
  let display: string
  if (hours === null) display = '—'
  else if (hours < 1) display = `${Math.round(hours * 60)}m`
  else if (hours < 24) display = `${hours}h`
  else display = `${(hours / 24).toFixed(1)}d`

  return (
    <div className="fc-admin-list-row">
      <span className="fc-admin-list-name">{label}</span>
      <span className="fc-admin-list-val">{display}</span>
    </div>
  )
}

function MiniBarChart({ title, data }: { title: string; data: Array<{ day: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="fc-admin-minichart">
      <div className="fc-admin-minichart-title">{title}</div>
      <div className="fc-admin-minichart-bars">
        {data.map((d) => (
          <div key={d.day} className="fc-admin-minichart-col" title={`${d.day}: ${d.count}`}>
            <div
              className="fc-admin-minichart-bar"
              style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="fc-admin-minichart-total">
        {data.reduce((s, d) => s + d.count, 0).toLocaleString()} total
      </div>
    </div>
  )
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="fc-admin-list">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="fc-admin-list-row">
          <Skeleton height={12} width="40%" style={{ borderRadius: 4 }} />
          <Skeleton height={12} width={40} style={{ borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
