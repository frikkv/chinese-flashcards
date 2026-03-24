import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/overview')({
  component: AdminOverviewPage,
})

type Range = '24h' | '7d' | '30d'

function AdminOverviewPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()
  const [range, setRange] = useState<Range>('7d')

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })
  const isAdmin = accessQuery.data?.isAdmin === true

  const statsQuery = useQuery({
    ...trpc.admin.getOverviewStats.queryOptions({ range }),
    enabled: isAdmin,
  })
  const insightsQuery = useQuery({
    ...trpc.admin.getInsights.queryOptions({ range }),
    enabled: isAdmin,
  })
  const growthQuery = useQuery({
    ...trpc.admin.getGrowthStats.queryOptions(),
    enabled: isAdmin,
  })
  const retentionQuery = useQuery({
    ...trpc.admin.getRetention.queryOptions(),
    enabled: isAdmin,
  })
  const funnelQuery = useQuery({
    ...trpc.admin.getFunnel.queryOptions(),
    enabled: isAdmin,
  })
  const activityQuery = useQuery({
    ...trpc.admin.getRecentActivity.queryOptions(),
    enabled: isAdmin,
  })
  const auditQuery = useQuery({
    ...trpc.admin.getAuditLog.queryOptions(),
    enabled: isAdmin,
  })

  if (authPending) {
    return <div className="fc-app fc-auth-loading"><div className="fc-auth-spinner" /></div>
  }
  if (!session?.user || accessQuery.isError) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">禁</div>
          <h2 className="fc-profile-noauth-title">Access denied</h2>
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>← Home</Link>
        </div>
      </div>
    )
  }

  const s = statsQuery.data
  const retention = retentionQuery.data
  const funnel = funnelQuery.data
  const growth = growthQuery.data
  const insights = insightsQuery.data
  const activity = activityQuery.data
  const audit = auditQuery.data
  const rangeLabel = range === '24h' ? '24h' : range === '7d' ? '7d' : '30d'

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container fc-admin-container--wide">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link active">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
          <Link to="/admin/announcements" className="fc-admin-nav-link">Announcements</Link>
          <Link to="/admin/feedback" className="fc-admin-nav-link">Feedback</Link>
        </div>

        {/* Title + date range picker */}
        <div className="fc-admin-title-row">
          <h1 className="fc-admin-title">Dashboard</h1>
          <div className="fc-admin-range-picker">
            {(['24h', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                className={`fc-admin-range-btn${range === r ? ' active' : ''}`}
                onClick={() => setRange(r)}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* KPI bar — always visible */}
        {s && (
          <div className="fc-admin-kpi-bar">
            <KpiCard label="Active Users" value={s.activeUsers} delta={s.activeUsersDelta} period={rangeLabel} />
            <KpiCard label="Sessions" value={s.sessions} delta={s.sessionsDelta} period={rangeLabel} />
            <KpiCard label="New Users" value={s.newUsers} delta={s.newUsersDelta} period={rangeLabel} />
            <KpiCard label="Chat Messages" value={s.chat} delta={s.chatDelta} period={rangeLabel} />
            {retention && <KpiCard label="D1 Retention" value={`${retention.d1.rate}%`} />}
            <KpiCard label="AI Cost" value={`$${s.aiCost.toFixed(2)}`} delta={s.aiCostDelta} period={rangeLabel} />
          </div>
        )}
        {statsQuery.isPending && (
          <div className="fc-admin-kpi-bar">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="fc-admin-kpi-card">
                <Skeleton height={22} width="50%" />
                <Skeleton height={10} width="70%" style={{ marginTop: 4 }} />
              </div>
            ))}
          </div>
        )}

        {/* Insights */}
        {insights && insights.length > 0 && (
          <div className="fc-admin-insights">
            {insights.map((text, i) => (
              <div key={i} className="fc-admin-insight">{text}</div>
            ))}
          </div>
        )}

        {/* Totals row */}
        {s && (
          <div className="fc-admin-stats-grid fc-admin-stats-grid--compact">
            <StatCard num={s.totalUsers} label="Total Users" />
            <StatCard num={s.totalStudySessions} label="Total Sessions" />
            <StatCard num={s.totalChatMessages} label="Chat Messages" />
            <StatCard num={s.totalCustomWordSets} label="Word Sets" />
            <StatCard num={s.totalFriendships} label="Friendships" />
            <StatCard num={s.totalFeedback} label="Feedback" />
          </div>
        )}

        {/* Retention + Funnel side by side */}
        <div className="fc-admin-two-col">
          {retention && (
            <div className="fc-admin-section fc-admin-section--compact">
              <h2 className="fc-admin-section-title">Retention</h2>
              <div className="fc-admin-list">
                {(['d1', 'd7', 'd30'] as const).map((key) => {
                  const d = retention[key]
                  const label = key === 'd1' ? 'Day 1' : key === 'd7' ? 'Day 7' : 'Day 30'
                  return (
                    <div key={key} className="fc-admin-list-row">
                      <span className="fc-admin-list-name">{label} <span className="fc-admin-list-sub">({d.retained}/{d.total})</span></span>
                      <span className={`fc-admin-retention-val${d.rate >= 30 ? ' fc-admin-retention-val--good' : ''}`}>{d.rate}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {funnel && (
            <div className="fc-admin-section fc-admin-section--compact">
              <h2 className="fc-admin-section-title">Funnel</h2>
              <div className="fc-admin-funnel">
                {funnel.map((step, i) => (
                  <div key={step.step} className="fc-admin-funnel-step">
                    <div className="fc-admin-funnel-bar-wrap">
                      <div className="fc-admin-funnel-bar" style={{ width: `${step.pct}%` }} />
                    </div>
                    <div className="fc-admin-funnel-info">
                      <span className="fc-admin-funnel-label">{step.step}</span>
                      <span className="fc-admin-funnel-val">{step.count.toLocaleString()}{i > 0 && <span className="fc-admin-funnel-pct"> ({step.pct}%)</span>}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Growth charts + Activity feed side by side */}
        <div className="fc-admin-two-col">
          {growth && (
            <div className="fc-admin-section fc-admin-section--compact">
              <h2 className="fc-admin-section-title">Growth (14d)</h2>
              <div className="fc-admin-charts-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                <MiniBarChart title="New Users" data={growth.newUsersDaily} />
                <MiniBarChart title="Active" data={growth.activeUsersDaily} />
                <MiniBarChart title="Sessions" data={growth.sessionsDaily} />
              </div>
            </div>
          )}
          {activity && activity.length > 0 && (
            <div className="fc-admin-section fc-admin-section--compact">
              <h2 className="fc-admin-section-title">Recent Activity</h2>
              <div className="fc-admin-activity-feed">
                {activity.map((a, i) => (
                  <div key={i} className="fc-admin-activity-row">
                    <span className={`fc-admin-activity-dot fc-admin-activity-dot--${a.type}`} />
                    <span className="fc-admin-activity-label">{a.label}</span>
                    <span className="fc-admin-activity-time">{timeAgo(a.time)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Audit log */}
        {audit && audit.length > 0 && (
          <div className="fc-admin-section fc-admin-section--compact">
            <h2 className="fc-admin-section-title">Admin Actions</h2>
            <div className="fc-admin-list">
              {audit.slice(0, 8).map((a) => (
                <div key={a.id} className="fc-admin-list-row">
                  <span className="fc-admin-list-name">
                    {a.adminDisplayName ?? 'Admin'}: {a.action}
                    {a.metadata && typeof a.metadata === 'object' && 'newRole' in a.metadata && (
                      <span className="fc-admin-list-sub"> → {(a.metadata as Record<string, string>).newRole}</span>
                    )}
                  </span>
                  <span className="fc-admin-list-val">{new Date(a.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────

function KpiCard({ label, value, delta, period }: { label: string; value: number | string; delta?: number | null; period?: string }) {
  return (
    <div className="fc-admin-kpi-card">
      <div className="fc-admin-kpi-val">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      <div className="fc-admin-kpi-label">{label}</div>
      {delta != null && (
        <div className={`fc-admin-kpi-delta${delta > 0 ? ' fc-admin-kpi-delta--up' : delta < 0 ? ' fc-admin-kpi-delta--down' : ''}`}>
          {delta > 0 ? '+' : ''}{delta}%{period ? ` vs prev ${period}` : ''}
        </div>
      )}
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

function MiniBarChart({ title, data }: { title: string; data: Array<{ day: string; count: number }> }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  return (
    <div className="fc-admin-minichart">
      <div className="fc-admin-minichart-title">{title}</div>
      <div className="fc-admin-minichart-bars">
        {data.map((d) => (
          <div key={d.day} className="fc-admin-minichart-col" title={`${d.day}: ${d.count}`}>
            <div className="fc-admin-minichart-bar" style={{ height: `${Math.max((d.count / max) * 100, 2)}%` }} />
          </div>
        ))}
      </div>
      <div className="fc-admin-minichart-total">{data.reduce((s, d) => s + d.count, 0).toLocaleString()}</div>
    </div>
  )
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}
