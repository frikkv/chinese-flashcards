import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/feedback')({
  component: AdminFeedbackPage,
})

const PAGE_SIZE = 50

type FeedbackStatus = 'new' | 'todo' | 'read' | 'done'

function AdminFeedbackPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [typeFilter, setTypeFilter] = useState<'all' | 'feedback' | 'feature' | 'bug'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackStatus>('all')

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })
  const isAdmin = accessQuery.data?.isAdmin === true

  const feedbackQuery = useQuery({
    ...trpc.admin.listFeedback.queryOptions({ limit: PAGE_SIZE, offset, typeFilter, statusFilter }),
    enabled: isAdmin,
  })

  const updateStatusMutation = useMutation(
    trpc.admin.updateFeedbackStatus.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.admin.listFeedback.queryKey() })
      },
    }),
  )

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

  const data = feedbackQuery.data
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const typeLabels: Record<string, string> = {
    feedback: 'Feedback',
    feature: 'Feature',
    bug: 'Bug',
  }

  function setStatus(id: string, status: FeedbackStatus) {
    updateStatusMutation.mutate({ id, status })
  }

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
          <Link to="/admin/announcements" className="fc-admin-nav-link">Announcements</Link>
          <Link to="/admin/feedback" className="fc-admin-nav-link active">Feedback</Link>
        </div>

        <div className="fc-admin-title-row">
          <h1 className="fc-admin-title">
            Feedback {total > 0 && <span className="fc-admin-title-count">({total})</span>}
          </h1>
        </div>

        {/* Filters */}
        <div className="fc-admin-toolbar">
          <div className="fc-admin-filter-row">
            <div className="fc-admin-role-filter">
              {(['all', 'feedback', 'feature', 'bug'] as const).map((t) => (
                <button
                  key={t}
                  className={`fc-setting-opt${typeFilter === t ? ' selected' : ''}`}
                  onClick={() => { setTypeFilter(t); setOffset(0) }}
                >
                  {t === 'all' ? 'All types' : typeLabels[t] ?? t}
                </button>
              ))}
            </div>
            <div className="fc-admin-role-filter">
              {(['all', 'new', 'todo', 'read', 'done'] as const).map((s) => (
                <button
                  key={s}
                  className={`fc-setting-opt${statusFilter === s ? ' selected' : ''}`}
                  onClick={() => { setStatusFilter(s); setOffset(0) }}
                >
                  {s === 'all' ? 'All status' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {feedbackQuery.isPending ? (
          <div className="fc-admin-table-wrap">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="fc-admin-feedback-row">
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Skeleton height={12} width="20%" />
                  <Skeleton height={11} width="70%" />
                </div>
                <Skeleton height={11} width={60} />
              </div>
            ))}
          </div>
        ) : data ? (
          <>
            <div className="fc-admin-table-wrap">
              {data.items.length === 0 && (
                <div className="fc-notif-empty">No feedback found</div>
              )}
              {data.items.map((fb) => (
                <div key={fb.id} className="fc-admin-feedback-row">
                  <div className="fc-admin-feedback-info">
                    <div className="fc-admin-feedback-header">
                      <span className={`fc-admin-feedback-type fc-admin-feedback-type--${fb.type}`}>
                        {typeLabels[fb.type] ?? fb.type}
                      </span>
                      <span className={`fc-admin-feedback-status fc-admin-feedback-status--${fb.status}`}>
                        {fb.status}
                      </span>
                      <span className="fc-admin-feedback-user">
                        {fb.displayName ?? 'Unknown'}
                        {fb.username && <span className="fc-admin-list-sub"> @{fb.username}</span>}
                      </span>
                      <span className="fc-admin-feedback-date">
                        {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="fc-admin-feedback-message">{fb.message}</div>
                    <div className="fc-admin-feedback-actions">
                      {(['todo', 'read', 'done'] as const).map((s) => (
                        <button
                          key={s}
                          className={`fc-admin-status-btn fc-admin-status-btn--${s}${fb.status === s ? ' active' : ''}`}
                          onClick={() => setStatus(fb.id, s)}
                          disabled={fb.status === s}
                        >
                          {s === 'todo' ? '📋 Todo' : s === 'read' ? '👁 Read' : '✅ Done'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
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
