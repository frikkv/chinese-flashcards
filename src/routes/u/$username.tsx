import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { computeXP, getLevelInfo } from '#/lib/levels'
import { FriendsModal } from '#/components/FriendsModal'

export const Route = createFileRoute('/u/$username')({ component: PublicProfilePage })

function PublicProfilePage() {
  const { username } = Route.useParams()
  const { data: session } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const profileQuery = useQuery(trpc.social.getProfile.queryOptions({ username }))

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.social.getProfile.queryKey({ username }) })
    qc.invalidateQueries({ queryKey: trpc.social.listFriends.queryKey() })
    qc.invalidateQueries({ queryKey: trpc.social.listOutgoingRequests.queryKey() })
    qc.invalidateQueries({ queryKey: trpc.social.listIncomingRequests.queryKey() })
  }

  const sendRequest = useMutation(
    trpc.social.sendFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const cancelRequest = useMutation(
    trpc.social.cancelFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const acceptRequest = useMutation(
    trpc.social.acceptFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const declineRequest = useMutation(
    trpc.social.declineFriendRequest.mutationOptions({ onSuccess: invalidate }),
  )
  const removeFriend = useMutation(
    trpc.social.removeFriend.mutationOptions({ onSuccess: invalidate }),
  )

  if (profileQuery.isPending) {
    return (
      <div className="fc-app fc-auth-loading">
        <div className="fc-auth-spinner" />
      </div>
    )
  }

  if (profileQuery.isError) {
    return (
      <div className="fc-app">
        <div className="fc-profile-noauth">
          <div className="fc-profile-noauth-char">404</div>
          <h2 className="fc-profile-noauth-title">User not found</h2>
          <p className="fc-profile-noauth-sub">@{username} doesn't exist.</p>
          <Link to="/" className="fc-start-btn" style={{ display: 'inline-block', textDecoration: 'none' }}>
            ← Home
          </Link>
        </div>
      </div>
    )
  }

  const profile = profileQuery.data!
  const fs = profile.friendStatus
  const isLoggedIn = !!session?.user

  function FriendButton() {
    if (!isLoggedIn || !fs) return null
    if (fs.status === 'self') return null

    if (fs.status === 'friends') {
      return (
        <button
          className="fc-social-btn fc-social-btn--danger"
          onClick={() => {
            if (confirm(`Remove ${profile.displayName} from friends?`)) {
              removeFriend.mutate({ friendshipId: fs.friendshipId })
            }
          }}
        >
          Remove Friend
        </button>
      )
    }
    if (fs.status === 'request_sent') {
      return (
        <button
          className="fc-social-btn fc-social-btn--secondary"
          onClick={() => cancelRequest.mutate({ friendshipId: fs.friendshipId })}
        >
          Cancel Request
        </button>
      )
    }
    if (fs.status === 'request_received') {
      return (
        <>
          <button
            className="fc-social-btn fc-social-btn--primary"
            onClick={() => acceptRequest.mutate({ friendshipId: fs.friendshipId })}
          >
            Accept Request
          </button>
          <button
            className="fc-social-btn fc-social-btn--secondary"
            onClick={() => declineRequest.mutate({ friendshipId: fs.friendshipId })}
          >
            Decline
          </button>
        </>
      )
    }
    // not_friends
    return (
      <button
        className="fc-social-btn fc-social-btn--primary"
        onClick={() => sendRequest.mutate({ targetUserId: profile.userId })}
      >
        Add Friend
      </button>
    )
  }

  const [showFriendsModal, setShowFriendsModal] = useState(false)

  const { stats } = profile
  const accuracy = stats.accuracy !== null ? `${stats.accuracy}%` : '—'
  const allTimeXP = computeXP(stats.totalCorrectAnswers, stats.totalSessions)
  const levelInfo = getLevelInfo(allTimeXP)

  return (
    <div className="fc-app">
      <div className="fc-social-container">

        <Link to="/" className="fc-back-btn" style={{ textDecoration: 'none' }}>
          ← Home
        </Link>

        {/* Header */}
        <div className="fc-profile-header">
          <div className="fc-profile-avatar">
            {(profile.displayName[0] ?? '?').toUpperCase()}
          </div>
          <div className="fc-profile-header-info">
            <div className="fc-profile-name-row">
              <div className="fc-profile-name">{profile.displayName}</div>
              <span className={`fc-level-badge fc-level-badge--tier${Math.ceil(levelInfo.level / 2)}`}>
                Lv.{levelInfo.level} · {levelInfo.title}
              </span>
            </div>
            <div className="fc-profile-email">@{profile.username}</div>
            {profile.bio && <div className="fc-social-bio">{profile.bio}</div>}
            <div className="fc-profile-meta">
              {profile.joinedAt && (
                <>
                  <span>Joined {new Date(profile.joinedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}</span>
                  <span className="fc-profile-dot">·</span>
                </>
              )}
              <button className="fc-profile-friend-count-btn" onClick={() => setShowFriendsModal(true)}>
                {profile.friendCount} {profile.friendCount === 1 ? 'friend' : 'friends'}
              </button>
            </div>
          </div>
          <div className="fc-social-profile-actions">
            {fs?.status === 'friends' && (
              <span className="fc-social-badge fc-social-badge--friends" style={{ marginRight: 8 }}>Friends</span>
            )}
            <FriendButton />
          </div>
        </div>

        {/* Stats */}
        <div className="fc-profile-section">
          <div className="fc-profile-section-title">Public Stats</div>
          <div className="fc-profile-stat-grid">
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{stats.totalSessions}</div>
              <div className="fc-profile-stat-label">Sessions</div>
            </div>
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{stats.totalCardsReviewed}</div>
              <div className="fc-profile-stat-label">Cards Reviewed</div>
            </div>
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{stats.uniqueCardsStudied}</div>
              <div className="fc-profile-stat-label">Unique Cards</div>
            </div>
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{accuracy}</div>
              <div className="fc-profile-stat-label">Accuracy</div>
            </div>
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{stats.weeklySessions}</div>
              <div className="fc-profile-stat-label">Sessions This Week</div>
            </div>
            <div className="fc-profile-stat">
              <div className="fc-profile-stat-num">{stats.weeklyCardsReviewed}</div>
              <div className="fc-profile-stat-label">Cards This Week</div>
            </div>
          </div>
        </div>

      </div>

      {showFriendsModal && (
        <FriendsModal
          userId={profile.userId}
          displayName={profile.displayName}
          onClose={() => setShowFriendsModal(false)}
        />
      )}
    </div>
  )
}
