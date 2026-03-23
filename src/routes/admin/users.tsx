import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [submittedSearch, setSubmittedSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'user' | 'admin'>('all')
  const [sort, setSort] = useState<'newest' | 'oldest' | 'most_sessions'>('newest')

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })

  const usersQuery = useQuery({
    ...trpc.admin.listUsers.queryOptions({
      limit: PAGE_SIZE,
      offset,
      search: submittedSearch || undefined,
      roleFilter,
      sort,
    }),
    enabled: accessQuery.data?.isAdmin === true,
  })

  const exportQuery = useQuery({
    ...trpc.admin.exportUsers.queryOptions(),
    enabled: false, // only fetch on demand
  })

  const updateRoleMutation = useMutation(
    trpc.admin.updateUserRole.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.admin.listUsers.queryKey() })
        qc.invalidateQueries({ queryKey: trpc.admin.getAuditLog.queryKey() })
      },
    }),
  )

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
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
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
  const myUserId = session.user.id

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSubmittedSearch(search.trim())
    setOffset(0)
  }

  function handleRoleChange(userId: string, currentRole: string | null) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin'
    if (userId === myUserId) {
      alert('You cannot change your own role.')
      return
    }
    if (!confirm(`Change this user's role to "${newRole}"?`)) return
    updateRoleMutation.mutate({ targetUserId: userId, newRole })
  }

  function handleExport() {
    exportQuery.refetch().then((result) => {
      if (!result.data) return
      const headers = ['ID', 'Name', 'Email', 'Username', 'Display Name', 'Role', 'Sessions', 'Chat Messages', 'Word Sets', 'Joined', 'Last Active']
      const rows = result.data.map((u) => [
        u.id, u.name, u.email, u.username, u.displayName, u.role,
        u.sessionCount, u.chatCount, u.wordsetCount,
        u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : '',
        u.lastActive ? new Date(u.lastActive).toISOString().split('T')[0] : '',
      ])
      const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link active">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
          <Link to="/admin/announcements" className="fc-admin-nav-link">Announcements</Link>
        </div>

        <div className="fc-admin-title-row">
          <h1 className="fc-admin-title">
            Users {total > 0 && <span className="fc-admin-title-count">({total})</span>}
          </h1>
          <button className="fc-util-btn" onClick={handleExport} disabled={exportQuery.isFetching}>
            {exportQuery.isFetching ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>

        {/* Search + filter + sort */}
        <div className="fc-admin-toolbar">
          <form className="fc-admin-search-form" onSubmit={handleSearch}>
            <input
              className="fc-social-search-input"
              type="text"
              placeholder="Search by name, email, or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button className="fc-util-btn" type="submit">Search</button>
          </form>
          <div className="fc-admin-filter-row">
            <div className="fc-admin-role-filter">
              {(['all', 'user', 'admin'] as const).map((r) => (
                <button
                  key={r}
                  className={`fc-setting-opt${roleFilter === r ? ' selected' : ''}`}
                  onClick={() => { setRoleFilter(r); setOffset(0) }}
                >
                  {r === 'all' ? 'All' : r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>
            <select
              className="fc-admin-sort-select"
              value={sort}
              onChange={(e) => { setSort(e.target.value as typeof sort); setOffset(0) }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="most_sessions">Most active</option>
            </select>
          </div>
        </div>

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
                      {u.role === 'admin' && <span className="fc-admin-badge">admin</span>}
                    </div>
                    <div className="fc-admin-user-meta">
                      {u.username && <span>@{u.username}</span>}
                      {u.username && u.email && <span> · </span>}
                      <span>{u.email}</span>
                    </div>
                    <div className="fc-admin-user-stats">
                      <span>{u.sessionCount} sessions</span>
                      <span>{u.chatCount} chats</span>
                      <span>{u.wordsetCount} sets</span>
                      {u.lastActive && (
                        <span>Active {new Date(u.lastActive).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="fc-admin-user-actions">
                    <span className="fc-admin-user-date">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      className={`fc-admin-role-btn${u.role === 'admin' ? ' fc-admin-role-btn--admin' : ''}`}
                      onClick={() => handleRoleChange(u.id, u.role)}
                      disabled={u.id === myUserId}
                      title={u.id === myUserId ? 'Cannot change own role' : 'Toggle role'}
                    >
                      {u.role ?? 'user'}
                    </button>
                  </div>
                </div>
              ))}
              {data.users.length === 0 && (
                <div className="fc-notif-empty">No users found</div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="fc-admin-pagination">
                <button className="fc-util-btn" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
                  Previous
                </button>
                <span className="fc-admin-page-info">Page {page} of {totalPages}</span>
                <button className="fc-util-btn" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((o) => o + PAGE_SIZE)}>
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
