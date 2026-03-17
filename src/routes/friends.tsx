import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'
import { Skeleton } from '#/components/Skeleton'

export const Route = createFileRoute('/friends')({ component: FriendsPage })

function FriendsPage() {
  const { data: session, isPending } = authClient.useSession()
  const trpc = useTRPC()
  const qc = useQueryClient()

  const [searchQuery, setSearchQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')

  const incomingQuery = useQuery({
    ...trpc.social.listIncomingRequests.queryOptions(),
    enabled: !!session?.user,
  })
  const outgoingQuery = useQuery({
    ...trpc.social.listOutgoingRequests.queryOptions(),
    enabled: !!session?.user,
  })
  const friendsQuery = useQuery({
    ...trpc.social.listFriends.queryOptions(),
    enabled: !!session?.user,
  })
  const searchResults = useQuery({
    ...trpc.social.searchUsers.queryOptions({ query: submittedQuery }),
    enabled: submittedQuery.length > 0,
  })

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: trpc.social.listIncomingRequests.queryKey(),
    })
    qc.invalidateQueries({
      queryKey: trpc.social.listOutgoingRequests.queryKey(),
    })
    qc.invalidateQueries({ queryKey: trpc.social.listFriends.queryKey() })
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

  if (isPending) {
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
          <div className="fc-profile-noauth-char">友</div>
          <h2 className="fc-profile-noauth-title">Sign in to manage friends</h2>
          <p className="fc-profile-noauth-sub">
            Add friends to compare weekly progress and build a leaderboard.
          </p>
          <Link
            to="/"
            className="fc-start-btn"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            ← Back to flashcards
          </Link>
        </div>
      </div>
    )
  }

  const incoming = incomingQuery.data ?? []
  const outgoing = outgoingQuery.data ?? []
  const friends = friendsQuery.data ?? []

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSubmittedQuery(searchQuery.trim())
  }

  const outgoingIds = new Set(outgoing.map((r) => r.userId))
  const friendIds = new Set(friends.map((r) => r.userId))

  return (
    <div className="fc-app">
      <div className="fc-social-container">
        <Link
          to="/profile"
          className="fc-back-btn"
          style={{ textDecoration: 'none' }}
        >
          ← Profile
        </Link>

        <div className="fc-social-title-row">
          <h1 className="fc-social-title">Friends</h1>
          <Link to="/leaderboard" className="fc-social-lb-link">
            Weekly Leaderboard →
          </Link>
        </div>

        {/* ── Search ─────────────────────────────────────────── */}
        <div className="fc-social-section">
          <div className="fc-social-section-title">Find People</div>
          <form className="fc-social-search-row" onSubmit={handleSearch}>
            <input
              className="fc-social-search-input"
              type="text"
              placeholder="Search by username or display name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button
              className="fc-social-search-btn"
              type="submit"
              disabled={!searchQuery.trim()}
            >
              Search
            </button>
          </form>

          {submittedQuery && (
            <div className="fc-social-results">
              {searchResults.isPending && (
                <div className="fc-social-hint">Searching…</div>
              )}
              {!searchResults.isPending &&
                (searchResults.data?.length ?? 0) === 0 && (
                  <div className="fc-social-hint">
                    No users found for "{submittedQuery}".
                  </div>
                )}
              {searchResults.data?.map((u) => {
                const isFriend = friendIds.has(u.userId)
                const isOutgoing = outgoingIds.has(u.userId)
                return (
                  <div key={u.userId} className="fc-social-user-row">
                    <div className="fc-social-user-avatar">
                      {(u.displayName[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="fc-social-user-info">
                      <Link
                        to="/u/$username"
                        params={{ username: u.username }}
                        className="fc-social-user-name"
                      >
                        {u.displayName}
                      </Link>
                      <div className="fc-social-user-handle">@{u.username}</div>
                    </div>
                    <div className="fc-social-user-actions">
                      {isFriend ? (
                        <span className="fc-social-badge fc-social-badge--friends">
                          Friends
                        </span>
                      ) : isOutgoing ? (
                        <button
                          className="fc-social-btn fc-social-btn--secondary"
                          onClick={() => {
                            const req = outgoing.find(
                              (r) => r.userId === u.userId,
                            )
                            if (req)
                              cancelRequest.mutate({
                                friendshipId: req.friendshipId,
                              })
                          }}
                        >
                          Cancel
                        </button>
                      ) : (
                        <button
                          className="fc-social-btn fc-social-btn--primary"
                          onClick={() =>
                            sendRequest.mutate({ targetUserId: u.userId })
                          }
                        >
                          Add Friend
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Incoming requests ──────────────────────────────── */}
        {incoming.length > 0 && (
          <div className="fc-social-section">
            <div className="fc-social-section-title">
              Friend Requests
              <span className="fc-social-badge fc-social-badge--count">
                {incoming.length}
              </span>
            </div>
            {incoming.map((req) => (
              <div key={req.friendshipId} className="fc-social-user-row">
                <div className="fc-social-user-avatar">
                  {(req.displayName[0] ?? '?').toUpperCase()}
                </div>
                <div className="fc-social-user-info">
                  {req.username ? (
                    <Link
                      to="/u/$username"
                      params={{ username: req.username }}
                      className="fc-social-user-name"
                    >
                      {req.displayName}
                    </Link>
                  ) : (
                    <span className="fc-social-user-name">
                      {req.displayName}
                    </span>
                  )}
                  {req.username && (
                    <div className="fc-social-user-handle">@{req.username}</div>
                  )}
                </div>
                <div className="fc-social-user-actions">
                  <button
                    className="fc-social-btn fc-social-btn--primary"
                    onClick={() =>
                      acceptRequest.mutate({ friendshipId: req.friendshipId })
                    }
                  >
                    Accept
                  </button>
                  <button
                    className="fc-social-btn fc-social-btn--secondary"
                    onClick={() =>
                      declineRequest.mutate({ friendshipId: req.friendshipId })
                    }
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Outgoing requests ──────────────────────────────── */}
        {outgoing.length > 0 && (
          <div className="fc-social-section">
            <div className="fc-social-section-title">Sent Requests</div>
            {outgoing.map((req) => (
              <div key={req.friendshipId} className="fc-social-user-row">
                <div className="fc-social-user-avatar">
                  {(req.displayName[0] ?? '?').toUpperCase()}
                </div>
                <div className="fc-social-user-info">
                  {req.username ? (
                    <Link
                      to="/u/$username"
                      params={{ username: req.username }}
                      className="fc-social-user-name"
                    >
                      {req.displayName}
                    </Link>
                  ) : (
                    <span className="fc-social-user-name">
                      {req.displayName}
                    </span>
                  )}
                  {req.username && (
                    <div className="fc-social-user-handle">@{req.username}</div>
                  )}
                </div>
                <div className="fc-social-user-actions">
                  <span className="fc-social-badge fc-social-badge--pending">
                    Pending
                  </span>
                  <button
                    className="fc-social-btn fc-social-btn--secondary"
                    onClick={() =>
                      cancelRequest.mutate({ friendshipId: req.friendshipId })
                    }
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Friends list ───────────────────────────────────── */}
        <div className="fc-social-section fc-social-friends-section">
          <div className="fc-social-section-title">
            Friends
            {friends.length > 0 && (
              <span className="fc-social-badge fc-social-badge--neutral">
                {friends.length}
              </span>
            )}
          </div>
          {friendsQuery.isPending && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="fc-social-user-row">
                  <Skeleton width={36} height={36} circle />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton height={13} width="42%" />
                    <Skeleton height={11} width="26%" />
                  </div>
                  <Skeleton height={30} width={68} style={{ borderRadius: 8 }} />
                </div>
              ))}
            </>
          )}
          {!friendsQuery.isPending && friends.length === 0 && (
            <div className="fc-social-hint">
              No friends yet. Search above to add someone!
            </div>
          )}
          {friends.map((f) => (
            <div key={f.friendshipId} className="fc-social-user-row">
              <div className="fc-social-user-avatar">
                {(f.displayName[0] ?? '?').toUpperCase()}
              </div>
              <div className="fc-social-user-info">
                {f.username ? (
                  <Link
                    to="/u/$username"
                    params={{ username: f.username }}
                    className="fc-social-user-name"
                  >
                    {f.displayName}
                  </Link>
                ) : (
                  <span className="fc-social-user-name">{f.displayName}</span>
                )}
                {f.username && (
                  <div className="fc-social-user-handle">@{f.username}</div>
                )}
              </div>
              <div className="fc-social-user-actions">
                <button
                  className="fc-social-btn fc-social-btn--danger"
                  onClick={() => {
                    if (confirm(`Remove ${f.displayName} from friends?`)) {
                      removeFriend.mutate({ friendshipId: f.friendshipId })
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
