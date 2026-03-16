import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  sessionOptions: {
    // Don't hit /api/auth/get-session on every tab focus — the session is
    // already validated on mount. It will still refetch after sign-in/out
    // and when reconnecting from offline.
    refetchOnWindowFocus: false,
  },
})
