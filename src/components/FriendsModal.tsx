import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useTRPC } from '#/integrations/trpc/react'

interface Props {
  userId: string
  displayName: string
  onClose: () => void
}

export function FriendsModal({ userId, displayName, onClose }: Props) {
  const trpc = useTRPC()
  const friendsQuery = useQuery(trpc.social.getFriendsOf.queryOptions({ userId }))
  const friends = friendsQuery.data ?? []

  return (
    <div className="fc-friends-modal-overlay" onClick={onClose}>
      <div className="fc-friends-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fc-friends-modal-header">
          <span className="fc-friends-modal-title">
            {displayName}'s Friends
            {!friendsQuery.isPending && (
              <span className="fc-friends-modal-count">{friends.length}</span>
            )}
          </span>
          <button className="fc-friends-modal-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        <div className="fc-friends-modal-body">
          {friendsQuery.isPending && (
            <div className="fc-friends-modal-loading">
              <div className="fc-auth-spinner" style={{ width: 22, height: 22, borderWidth: 2 }} />
            </div>
          )}

          {!friendsQuery.isPending && friends.length === 0 && (
            <div className="fc-friends-modal-empty">No friends yet.</div>
          )}

          {friends.map((f) => (
            <Link
              key={f.userId}
              to="/u/$username"
              params={{ username: f.username }}
              className="fc-friends-modal-row"
              onClick={onClose}
            >
              <div className="fc-friends-modal-avatar">
                {(f.displayName[0] ?? '?').toUpperCase()}
              </div>
              <div className="fc-friends-modal-info">
                <div className="fc-friends-modal-name">{f.displayName}</div>
                <div className="fc-friends-modal-handle">@{f.username}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
