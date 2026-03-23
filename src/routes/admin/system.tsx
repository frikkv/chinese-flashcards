import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/system')({
  component: AdminSystemPage,
})

function AdminSystemPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })
  const aiQuery = useQuery({
    ...trpc.admin.getAiUsage.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const healthQuery = useQuery({
    ...trpc.admin.getSystemHealth.queryOptions(),
    enabled: accessQuery.data?.isAdmin === true,
  })
  const auditQuery = useQuery({
    ...trpc.admin.getAuditLog.queryOptions(),
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
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>← Home</Link>
        </div>
      </div>
    )
  }

  const ai = aiQuery.data
  const health = healthQuery.data
  const audit = auditQuery.data

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link active">System</Link>
          <Link to="/admin/announcements" className="fc-admin-nav-link">Announcements</Link>
        </div>

        <h1 className="fc-admin-title">System</h1>

        {/* AI Request Volume */}
        {ai && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">AI Request Volume</h2>
            <div className="fc-admin-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <Stat num={ai.volume.last24h} label="Last 24h" />
              <Stat num={ai.volume.last7d} label="Last 7d" />
              <Stat num={ai.volume.last30d} label="Last 30d" />
              <Stat num={ai.volume.total} label="All time" />
            </div>
          </div>
        )}

        {/* Cost + Tokens (30d) */}
        {ai && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">
              AI Cost & Tokens (30d)
              <span className="fc-admin-section-sub">from metered usage</span>
            </h2>
            <div className="fc-admin-stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <Stat num={`$${ai.cost30d.toFixed(4)}`} label="Total cost" />
              <Stat num={ai.tokens30d.input.toLocaleString()} label="Input tokens" />
              <Stat num={ai.tokens30d.output.toLocaleString()} label="Output tokens" />
            </div>
          </div>
        )}

        {/* By Feature + By Model */}
        {ai && (
          <div className="fc-admin-two-col">
            {ai.byFeature.length > 0 && (
              <div className="fc-admin-section">
                <h2 className="fc-admin-section-title">Usage by Feature</h2>
                <div className="fc-admin-list">
                  {ai.byFeature.map((f) => (
                    <div key={f.feature} className="fc-admin-list-row">
                      <span className="fc-admin-list-name">
                        {f.feature}
                        <span className="fc-admin-list-sub"> · {(f.inputTokens + f.outputTokens).toLocaleString()} tokens</span>
                      </span>
                      <span className="fc-admin-list-val">
                        {f.requests.toLocaleString()} req · ${f.cost.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {ai.byModel.length > 0 && (
              <div className="fc-admin-section">
                <h2 className="fc-admin-section-title">Usage by Model</h2>
                <div className="fc-admin-list">
                  {ai.byModel.map((m) => (
                    <div key={m.model} className="fc-admin-list-row">
                      <span className="fc-admin-list-name">{m.model}</span>
                      <span className="fc-admin-list-val">{m.requests.toLocaleString()} requests</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top AI Users */}
        {ai && ai.topUsers7d.length > 0 && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Top AI-Consuming Users (7d)</h2>
            <div className="fc-admin-list">
              {ai.topUsers7d.map((u, i) => (
                <div key={u.userId} className="fc-admin-list-row">
                  <span className="fc-admin-list-name">
                    {i + 1}. {u.displayName}
                    {u.username && <span className="fc-admin-list-sub"> @{u.username}</span>}
                  </span>
                  <span className="fc-admin-list-val">
                    {u.requests} req · ${u.cost.toFixed(4)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Heavy Users + Operational */}
        <div className="fc-admin-two-col">
          {health && health.topChatUsers.length > 0 && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">Top Chat Users (7d)</h2>
              <div className="fc-admin-list">
                {health.topChatUsers.map((u, i) => (
                  <div key={u.userId} className="fc-admin-list-row">
                    <span className="fc-admin-list-name">
                      {i + 1}. {u.displayName}
                      {u.username && <span className="fc-admin-list-sub"> @{u.username}</span>}
                    </span>
                    <span className="fc-admin-list-val">{u.count} msgs</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {health && health.topSessionUsers.length > 0 && (
            <div className="fc-admin-section">
              <h2 className="fc-admin-section-title">Top Study Users (7d)</h2>
              <div className="fc-admin-list">
                {health.topSessionUsers.map((u, i) => (
                  <div key={u.userId} className="fc-admin-list-row">
                    <span className="fc-admin-list-name">
                      {i + 1}. {u.displayName}
                      {u.username && <span className="fc-admin-list-sub"> @{u.username}</span>}
                    </span>
                    <span className="fc-admin-list-val">{u.count} sessions</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Operational */}
        {health && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Operational</h2>
            <div className="fc-admin-list">
              <div className="fc-admin-list-row">
                <span className="fc-admin-list-name">Rate limit hits (7d)</span>
                <span className="fc-admin-list-val">{health.rateLimitHitsThisWeek}</span>
              </div>
            </div>
          </div>
        )}

        {/* Recent Admin Actions */}
        {audit && audit.length > 0 && (
          <div className="fc-admin-section">
            <h2 className="fc-admin-section-title">Recent Admin Actions</h2>
            <div className="fc-admin-list">
              {audit.map((a) => (
                <div key={a.id} className="fc-admin-list-row">
                  <span className="fc-admin-list-name">
                    {a.adminDisplayName ?? a.adminUsername ?? 'Admin'}: {a.action}
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

function Stat({ num, label }: { num: number | string; label: string }) {
  return (
    <div className="fc-admin-stat-card">
      <div className="fc-admin-stat-num">{typeof num === 'number' ? num.toLocaleString() : num}</div>
      <div className="fc-admin-stat-label">{label}</div>
    </div>
  )
}
