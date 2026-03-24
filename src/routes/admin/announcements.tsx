import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { AppHeader } from '#/components/AppHeader'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/admin/announcements')({
  component: AdminAnnouncementsPage,
})

function AdminAnnouncementsPage() {
  const { data: session, isPending: authPending } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editId, setEditId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const accessQuery = useQuery({
    ...trpc.admin.checkAccess.queryOptions(),
    enabled: !!session?.user,
    retry: false,
  })
  const isAdmin = accessQuery.data?.isAdmin === true

  const listQuery = useQuery({
    ...trpc.announcements.list.queryOptions(),
    enabled: isAdmin,
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.announcements.list.queryKey() })
    qc.invalidateQueries({ queryKey: trpc.announcements.getPublished.queryKey() })
  }

  const createMutation = useMutation(trpc.announcements.create.mutationOptions({ onSuccess: () => { invalidate(); resetForm() } }))
  const updateMutation = useMutation(trpc.announcements.update.mutationOptions({ onSuccess: () => { invalidate(); resetForm() } }))
  const publishMutation = useMutation(trpc.announcements.publish.mutationOptions({ onSuccess: invalidate }))
  const unpublishMutation = useMutation(trpc.announcements.unpublish.mutationOptions({ onSuccess: invalidate }))
  const pinMutation = useMutation(trpc.announcements.pin.mutationOptions({ onSuccess: invalidate }))
  const unpinMutation = useMutation(trpc.announcements.unpin.mutationOptions({ onSuccess: invalidate }))
  const deleteMutation = useMutation(trpc.announcements.delete.mutationOptions({ onSuccess: invalidate }))

  function resetForm() {
    setMode('list')
    setEditId(null)
    setTitle('')
    setBody('')
  }

  function startEdit(a: { id: string; title: string; body: string }) {
    setEditId(a.id)
    setTitle(a.title)
    setBody(a.body)
    setMode('edit')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    if (mode === 'edit' && editId) {
      updateMutation.mutate({ id: editId, title: title.trim(), body: body.trim() })
    } else {
      createMutation.mutate({ title: title.trim(), body: body.trim() })
    }
  }

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

  const items = listQuery.data ?? []

  return (
    <div className="fc-app fc-app--wordset">
      <AppHeader />
      <div className="fc-admin-container">
        <div className="fc-admin-nav">
          <Link to="/admin/overview" className="fc-admin-nav-link">Overview</Link>
          <Link to="/admin/analytics" className="fc-admin-nav-link">Analytics</Link>
          <Link to="/admin/users" className="fc-admin-nav-link">Users</Link>
          <Link to="/admin/system" className="fc-admin-nav-link">System</Link>
          <Link to="/admin/announcements" className="fc-admin-nav-link active">Announcements</Link>
          <Link to="/admin/feedback" className="fc-admin-nav-link">Feedback</Link>
        </div>

        <div className="fc-admin-title-row">
          <h1 className="fc-admin-title">
            {mode === 'create' ? 'New Announcement' : mode === 'edit' ? 'Edit Announcement' : 'Announcements'}
          </h1>
          {mode === 'list' && (
            <button className="fc-util-btn" onClick={() => { setTitle(''); setBody(''); setMode('create') }}>
              New +
            </button>
          )}
          {mode !== 'list' && (
            <button className="fc-util-btn" onClick={resetForm}>← Back</button>
          )}
        </div>

        {/* Create / Edit form */}
        {mode !== 'list' && (
          <div className="fc-admin-section">
            <form onSubmit={handleSubmit}>
              <div className="fc-admin-form-group">
                <label className="fc-admin-form-label">Title</label>
                <input
                  className="fc-social-search-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Announcement title"
                  maxLength={200}
                />
              </div>
              <div className="fc-admin-form-group">
                <label className="fc-admin-form-label">Body</label>
                <textarea
                  className="fc-feedback-textarea"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Announcement body text..."
                  rows={5}
                  maxLength={5000}
                />
              </div>
              <button
                type="submit"
                className="fc-start-btn"
                style={{ padding: '10px 24px', fontSize: '0.9rem' }}
                disabled={!title.trim() || !body.trim() || createMutation.isPending || updateMutation.isPending}
              >
                {mode === 'edit'
                  ? updateMutation.isPending ? 'Saving...' : 'Save Changes'
                  : createMutation.isPending ? 'Creating...' : 'Create Announcement'}
              </button>
            </form>
          </div>
        )}

        {/* List */}
        {mode === 'list' && (
          <>
            {listQuery.isPending && (
              <div className="fc-admin-table-wrap">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="fc-admin-user-row">
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <Skeleton height={14} width="40%" />
                      <Skeleton height={11} width="70%" />
                    </div>
                    <Skeleton height={11} width={60} />
                  </div>
                ))}
              </div>
            )}
            {!listQuery.isPending && items.length === 0 && (
              <div className="fc-admin-section">
                <div className="fc-notif-empty">No announcements yet. Create one above.</div>
              </div>
            )}
            {!listQuery.isPending && items.length > 0 && (
              <div className="fc-admin-table-wrap">
                {items.map((a) => (
                  <div key={a.id} className="fc-admin-announce-row">
                    <div className="fc-admin-announce-info">
                      <div className="fc-admin-announce-title">
                        {a.title}
                        {a.isPinned && <span className="fc-admin-badge" style={{ marginLeft: 6 }}>pinned</span>}
                        {a.isPublished
                          ? <span className="fc-admin-badge" style={{ marginLeft: 6, background: 'var(--fc-success-light)', color: 'var(--fc-success)' }}>published</span>
                          : <span className="fc-admin-badge" style={{ marginLeft: 6 }}>draft</span>
                        }
                      </div>
                      <div className="fc-admin-user-meta">
                        {a.body.length > 100 ? a.body.slice(0, 100) + '...' : a.body}
                      </div>
                      <div className="fc-admin-user-stats">
                        <span>Created {new Date(a.createdAt).toLocaleDateString()}</span>
                        {a.publishedAt && <span>Published {new Date(a.publishedAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <div className="fc-admin-announce-actions">
                      <button className="fc-admin-action-btn" onClick={() => startEdit(a)}>Edit</button>
                      {a.isPublished
                        ? <button className="fc-admin-action-btn" onClick={() => unpublishMutation.mutate({ id: a.id })}>Unpublish</button>
                        : <button className="fc-admin-action-btn fc-admin-action-btn--primary" onClick={() => publishMutation.mutate({ id: a.id })}>Publish</button>
                      }
                      {a.isPinned
                        ? <button className="fc-admin-action-btn" onClick={() => unpinMutation.mutate({ id: a.id })}>Unpin</button>
                        : <button className="fc-admin-action-btn" onClick={() => pinMutation.mutate({ id: a.id })}>Pin</button>
                      }
                      <button
                        className="fc-admin-action-btn fc-admin-action-btn--danger"
                        onClick={() => { if (confirm('Delete this announcement?')) deleteMutation.mutate({ id: a.id }) }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
