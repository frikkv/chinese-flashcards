import { createAuthClient } from 'better-auth/react'
import { DEMO_AUTH, DEMO_SESSION } from './demo-auth'

const realAuthClient = createAuthClient({
  sessionOptions: {
    // Don't hit /api/auth/get-session on every tab focus — the session is
    // already validated on mount. It will still refetch after sign-in/out
    // and when reconnecting from offline.
    refetchOnWindowFocus: false,
  },
})

/**
 * Demo-aware auth client wrapper.
 * When DEMO_AUTH is true, useSession returns the demo user immediately.
 */
export const authClient = {
  ...realAuthClient,
  useSession: DEMO_AUTH
    ? () => ({
        data: DEMO_SESSION,
        isPending: false,
        error: null,
        refetch: () => Promise.resolve(DEMO_SESSION),
      })
    : realAuthClient.useSession,
  signOut: DEMO_AUTH
    ? () => {
        console.log('[Demo Mode] Sign out ignored in demo mode')
        return Promise.resolve()
      }
    : realAuthClient.signOut,
  signIn: DEMO_AUTH
    ? {
        ...realAuthClient.signIn,
        social: () => {
          console.log('[Demo Mode] Social sign in ignored in demo mode')
          return Promise.resolve({ data: DEMO_SESSION, error: null })
        },
        email: () => {
          console.log('[Demo Mode] Email sign in ignored in demo mode')
          return Promise.resolve({ data: DEMO_SESSION, error: null })
        },
      }
    : realAuthClient.signIn,
  signUp: DEMO_AUTH
    ? {
        ...realAuthClient.signUp,
        email: () => {
          console.log('[Demo Mode] Email sign up ignored in demo mode')
          return Promise.resolve({ data: DEMO_SESSION, error: null })
        },
      }
    : realAuthClient.signUp,
}
