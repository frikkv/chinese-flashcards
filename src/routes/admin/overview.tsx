import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/overview')({
  component: AdminOverviewPage,
})

function AdminOverviewPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })

  const statsQuery = useQuery({
    ...trpc.admin.getOverviewStats.queryOptions(),
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
  const auditQuery = useQuery({
    ...trpc.admin.getAuditLog.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
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

  const stats = statsQuery.data
  const events = eventQuery.data
  const growth = growthQuery.data
  const features = featureQuery.data
  const audit = auditQuery.data
  const retention = retentionQuery.data
  const funnel = funnelQuery.data
  const ttv = ttvQuery.data

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link active">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
        </div>

        <h1 className="fc-admin-title">Dashboard</h1>

        {/* KPI cards */}
        {statsQuery.isPending ? (
          <div className="fc-admin-stats-grid">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className="fc-admin-stat-card">
                <Skeleton height={28} width="50%" />
                <Skeleton height={12} width="70%" style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>
        ) : stats ? (
          <div className="fc-admin-stats-grid">
            <StatCard num={stats.totalUsers} label="Total Users" />
            <StatCard num={stats.newUsersThisWeek} label="New Users (7d)" />
            <StatCard num={stats.activeUsersThisWeek} label="Active Users (7d)" />
            <StatCard num={stats.totalStudySessions} label="Total Sessions" />
            <StatCard num={stats.studySessionsThisWeek} label="Sessions (7d)" />
            <StatCard num={stats.totalChatMessages} label="Chat Messages" />
            <StatCard num={stats.totalCustomWordSets} label="Custom Word Sets" />
            <StatCard num={stats.totalFriendships} label="Friendships" />
            <StatCard num={stats.totalFeedback} label="Feedback Items" />
          </div>
        ) : null}

        {/* Retention + Time to Value */}
        <div className="fc-admin-two-col">
          {retention && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">Retention</h2>
              <div className="fc-admin-list">
                {(['d1', 'd7', 'd30'] as const).map((key) => {
                  const d = retention[key]
                  const label = key === 'd1' ? 'Day 1' : key === 'd7' ? 'Day 7' : 'Day 30'
                  return (
                    <div key={key} className="fc-admin-list-row">
                      <span className="fc-admin-list-name">
                        {label}
                        <span className="fc-admin-list-sub"> ({d.retained}/{d.total})</span>
                      </span>
                      <span className={`fc-admin-retention-val${d.rate >= 30 ? ' fc-admin-retention-val--good' : ''}`}>
                        {d.rate}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {ttv && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">Time to Value (median)</h2>
              <div className="fc-admin-list">
                {([
                  ['First study session', ttv.firstStudySession],
                  ['First chat message', ttv.firstChatMessage],
                  ['First custom word set', ttv.firstCustomWordSet],
                ] as const).map(([label, hours]) => (
                  <div key={label} className="fc-admin-list-row">
                    <span className="fc-admin-list-name">{label}</span>
                    <span className="fc-admin-list-val">
                      {hours === null ? '—' : hours < 1 ? `${Math.round(hours * 60)}m` : hours < 24 ? `${hours}h` : `${(hours / 24).toFixed(1)}d`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Funnel */}
        {funnel && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Product Funnel</h2>
            <div className="fc-admin-funnel">
              {funnel.map((step, i) => (
                <div key={step.step} className="fc-admin-funnel-step">
                  <div className="fc-admin-funnel-bar-wrap">
                    <div className="fc-admin-funnel-bar" style={{ width: `${step.pct}%` }} />
                  </div>
                  <div className="fc-admin-funnel-info">
                    <span className="fc-admin-funnel-label">{step.step}</span>
                    <span className="fc-admin-funnel-val">
                      {step.count.toLocaleString()}
                      {i > 0 && <span className="fc-admin-funnel-pct"> ({step.pct}%)</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Daily activity — 14 day bar chart */}
        {growth && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Last 14 Days</h2>
            <div className="fc-admin-charts-row">
              <MiniBarChart
                title="New Users"
                data={growth.newUsersDaily}
              />
              <MiniBarChart
                title="Active Users"
                data={growth.activeUsersDaily}
              />
              <MiniBarChart
                title="Study Sessions"
                data={growth.sessionsDaily}
              />
            </div>
          </div>
        )}

        {/* Event + feature lists side by side */}
        <div className="fc-admin-two-col">
          {/* Top events */}
          {events && events.topEvents.length > 0 && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">
                Top Events
                <span className="fc-admin-section-sub">
                  {events.totalEvents.toLocaleString()} total · {events.eventsThisWeek.toLocaleString()} this week
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

          {/* Feature usage */}
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
                  <span className="fc-admin-list-name">Accepted friendships</span>
                  <span className="fc-admin-list-val">{features.totalAcceptedFriendships.toLocaleString()}</span>
                </div>
              </div>

              {features.topUsers.length > 0 && (
                <>
                  <h3 className="fc-admin-section-subtitle">Top Users by Sessions</h3>
                  <div className="fc-admin-list">
                    {features.topUsers.map((u, i) => (
                      <div key={u.userId} className="fc-admin-list-row">
                        <span className="fc-admin-list-name">
                          {i + 1}. {u.displayName}
                          {u.username && <span className="fc-admin-list-sub"> @{u.username}</span>}
                        </span>
                        <span className="fc-admin-list-val">{u.sessionCount.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Audit log */}
        {audit && audit.length > 0 && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Recent Admin Actions</h2>
            <div className="fc-admin-list">
              {audit.map((a) => (
                <div key={a.id} className="fc-admin-list-row">
                  <span className="fc-admin-list-name">
                    {a.adminDisplayName ?? a.adminUsername ?? 'Admin'}: {a.action}
                    {a.metadata && typeof a.metadata === 'object' && 'newRole' in a.metadata && (
                      <span className="fc-admin-list-sub">
                        {' '}→ {(a.metadata as Record<string, string>).newRole}
                      </span>
                    )}
                  </span>
                  <span className="fc-admin-list-val">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ num, label }: { num: number; label: string }) {
  return (
    <div className="fc-admin-stat-card">
      <div className="fc-admin-stat-num">{num.toLocaleString()}</div>
      <div className="fc-admin-stat-label">{label}</div>
    </div>
  )
}

function MiniBarChart({
  title,
  data,
}: {
  title: string
  data: Array<{ day: string; count: number }>
}) {
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
