import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/users')({
  component: AdminUsersPage,
})

const PAGE_SIZE = 50

function AdminUsersPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()
  const [offset, setOffset] = useState(0)

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })

  const usersQuery = useQuery({
    ...trpc.admin.listUsers.queryOptions({ limit: PAGE_SIZE, offset }),
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

  const data = usersQuery.data
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">
            Overview
          </Link>
          <Link to="/admin/users" className="fc-admin-nav-link active">
            Users
          </Link>
        </div>

        <h1 className="fc-admin-title">
          Users {total > 0 && <span className="fc-admin-title-count">({total})</span>}
        </h1>

        {usersQuery.isPending ? (
          <div className="fc-admin-table-wrap">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="fc-admin-user-row">
                <Skeleton width={32} height={32} circle />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Skeleton height={13} width="30%" />
                  <Skeleton height={11} width="45%" />
                </div>
                <Skeleton height={11} width={60} />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            <div className="fc-admin-table-wrap">
              {data.users.map((u) => (
                <div key={u.id} className="fc-admin-user-row">
                  <div className="fc-social-user-avatar">
                    {((u.displayName ?? u.name)?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="fc-admin-user-info">
                    <div className="fc-admin-user-name">
                      {u.username ? (
                        <Link
                          to="/u/$username"
                          params={{ username: u.username }}
                          style={{ color: 'inherit', textDecoration: 'none' }}
                        >
                          {u.displayName ?? u.name}
                        </Link>
                      ) : (
                        u.displayName ?? u.name
                      )}
                      {u.role === 'admin' && (
                        <span className="fc-admin-badge">admin</span>
                      )}
                    </div>
                    <div className="fc-admin-user-meta">
                      {u.username && <span>@{u.username}</span>}
                      {u.username && u.email && <span> · </span>}
                      <span>{u.email}</span>
                    </div>
                  </div>
                  <div className="fc-admin-user-date">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
              {data.users.length === 0 && (
                <div className="fc-notif-empty">No users found</div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="fc-admin-pagination">
                <button
                  className="fc-util-btn"
                  disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                >
                  Previous
                </button>
                <span className="fc-admin-page-info">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="fc-util-btn"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
