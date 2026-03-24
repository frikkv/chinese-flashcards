import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Trophy, Bell, MessageSquarePlus, Settings, X, Inbox, Megaphone } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'

export function AppHeader({ onSignIn }: { onSignIn?: () => void }) {
  const { data: authSession, isPending: authPending } = authClient.useSession()
  const isSignedIn = !!authSession?.user
  const showSignIn = !authPending && !isSignedIn && onSignIn
  const [notifOpen, setNotifOpen] = useState(false)
  const trpc = useTRPC()
  const qc = useQueryClient()

  // Streak
  const retentionQuery = useQuery({
    ...trpc.progress.getRetention.queryOptions(),
    enabled: isSignedIn,
    staleTime: 30_000,
  })
  const streak = retentionQuery.data?.currentStreak ?? 0

  // Unread count for badge
  const unreadQuery = useQuery({
    ...trpc.announcements.getUnreadCount.queryOptions(),
    enabled: isSignedIn,
    staleTime: 30_000,
  })
  const unreadCount = unreadQuery.data ?? 0

  const markAllMutation = useMutation(
    trpc.announcements.markAllAsRead.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.announcements.getUnreadCount.queryKey() })
        qc.invalidateQueries({ queryKey: trpc.announcements.getPublishedWithReadState.queryKey() })
      },
    }),
  )

  function handleOpenNotif() {
    setNotifOpen(true)
    if (isSignedIn && unreadCount > 0) {
      markAllMutation.mutate()
    }
  }

  return (
    <div className="fc-ws-topbar">
      <div className="fc-ws-brand-left">
        <Link to="/" className="fc-ws-brand-title">学中文</Link>
        <Link
          to="/leaderboard"
          className="fc-ws-lb-icon-btn"
          aria-label="Leaderboard"
        >
          <Trophy size={18} strokeWidth={2} />
        </Link>
        <Link
          to="/feedback"
          className="fc-ws-lb-icon-btn"
          aria-label="Give feedback"
        >
          <MessageSquarePlus size={18} strokeWidth={2} />
        </Link>
        <Link
          to="/settings"
          className="fc-ws-lb-icon-btn"
          aria-label="Settings"
        >
          <Settings size={18} strokeWidth={2} />
        </Link>
      </div>
      {showSignIn ? (
        <button className="fc-profile-nav-btn" onClick={onSignIn}>
          Sign in
        </button>
      ) : isSignedIn ? (
        <div className="fc-ws-topbar-right">
          <div className={`fc-ws-streak${streak > 0 ? ' fc-ws-streak--active' : ''}`}>
            <span className="fc-ws-streak-fire">{streak > 0 ? '🔥' : '🔥'}</span>
            <span className="fc-ws-streak-num">{streak}</span>
          </div>
          <button
            className="fc-ws-bell-btn"
            aria-label="Notifications"
            onClick={() => notifOpen ? setNotifOpen(false) : handleOpenNotif()}
          >
            <Bell size={18} strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="fc-ws-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
          <ProfileMenu />
        </div>
      ) : null}

      {/* Notification sidebar */}
      {notifOpen && (
        <div className="fc-notif-overlay" onClick={() => setNotifOpen(false)}>
          <div className="fc-notif-sidebar" onClick={(e) => e.stopPropagation()}>
            <div className="fc-notif-header">
              <span className="fc-notif-title">Notifications</span>
              <button
                className="fc-notif-close"
                onClick={() => setNotifOpen(false)}
                aria-label="Close"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="fc-notif-body">
              <div className="fc-notif-section">
                <div className="fc-notif-section-title">
                  <Inbox size={15} strokeWidth={2} />
                  Inbox
                </div>
                <div className="fc-notif-section-content">
                  <div className="fc-notif-empty">No messages</div>
                </div>
              </div>
              <AnnouncementsSection />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileMenu() {
  const trpc = useTRPC()
  const myProfileQuery = useQuery({
    ...trpc.social.getMyProfile.queryOptions(),
    staleTime: 60_000,
  })
  const username = myProfileQuery.data?.username
  const role = myProfileQuery.data?.role

  return (
    <div className="fc-profile-menu-wrap">
      <Link to="/profile" className="fc-profile-menu-trigger">
        <User size={20} strokeWidth={2} />
        {username && <span className="fc-ws-topbar-name">{username}</span>}
      </Link>
      <div className="fc-profile-menu">
        <Link to="/profile" className="fc-profile-menu-item">
          User stats
        </Link>
        <Link to="/friends" className="fc-profile-menu-item">
          Friends
        </Link>
        {username && (
          <Link
            to="/u/$username"
            params={{ username }}
            className="fc-profile-menu-item"
          >
            Public profile
          </Link>
        )}
        <Link to="/settings" className="fc-profile-menu-item">
          Settings
        </Link>
        {role === 'admin' && (
          <Link to="/admin/overview" className="fc-profile-menu-item">
            Admin dashboard
          </Link>
        )}
        <button
          className="fc-profile-menu-item fc-profile-menu-item--danger"
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
  )
}

function AnnouncementsSection() {
  const trpc = useTRPC()
  const { data: authSession } = authClient.useSession()
  const isSignedIn = !!authSession?.user

  // Use read-state-aware query for signed-in users, plain query for guests
  const withReadState = useQuery({
    ...trpc.announcements.getPublishedWithReadState.queryOptions(),
    enabled: isSignedIn,
    staleTime: 30_000,
  })
  const publicOnly = useQuery({
    ...trpc.announcements.getPublished.queryOptions(),
    enabled: !isSignedIn,
    staleTime: 60_000,
  })

  const items = isSignedIn
    ? (withReadState.data ?? []).map((a) => ({ ...a, isRead: a.isRead }))
    : (publicOnly.data ?? []).map((a) => ({ ...a, isRead: true })) // guests: treat all as read (no badge)

  return (
    <div className="fc-notif-section">
      <div className="fc-notif-section-title">
        <Megaphone size={15} strokeWidth={2} />
        Announcements
      </div>
      <div className="fc-notif-section-content">
        {items.length === 0 ? (
          <div className="fc-notif-empty">No announcements</div>
        ) : (
          items.map((a) => (
            <div
              key={a.id}
              className={`fc-notif-announce-item${!a.isRead ? ' fc-notif-announce-item--unread' : ''}`}
            >
              <div className="fc-notif-announce-title">
                {a.isPinned && <span className="fc-notif-pin">📌 </span>}
                {a.title}
                {!a.isRead && <span className="fc-notif-unread-dot" />}
              </div>
              <div className="fc-notif-announce-body">{a.body}</div>
              {a.publishedAt && (
                <div className="fc-notif-announce-date">
                  {new Date(a.publishedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
