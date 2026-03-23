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

  if (authPending) {
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
          <div className="fc-profile-noauth-char">管</div>
          <h2 className="fc-profile-noauth-title">Sign in required</h2>
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

  if (accessQuery.isError) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">禁</div>
          <h2 className="fc-profile-noauth-title">Access denied</h2>
          <p className="fc-profile-noauth-sub">
            You do not have admin privileges.
          </p>
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

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link active">
            Overview
          </Link>
          <Link to="/admin/users" className="fc-admin-nav-link">
            Users
          </Link>
        </div>

        <h1 className="fc-admin-title">Dashboard</h1>

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
