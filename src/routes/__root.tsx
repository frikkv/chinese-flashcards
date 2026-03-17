import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import TanStackQueryProvider from '../integrations/tanstack-query/root-provider'

// Devtools are dev-only — lazy-load so they stay out of the production bundle
const DevToolsPanel = import.meta.env.DEV
  ? lazy(() => import('#/components/DevToolsPanel'))
  : null
import appCss from '../styles.css?url'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

import type { QueryClient } from '@tanstack/react-query'
import type { TRPCRouter } from '#/integrations/trpc/router'
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query'
import { authClient } from '#/lib/auth-client'
import { useTRPC } from '#/integrations/trpc/react'

interface MyRouterContext {
  queryClient: QueryClient
  trpc: TRPCOptionsProxy<TRPCRouter>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: '汉字 · Hànzì — Chinese Flashcards' },
    ],
    links: [
      // Establish connections to Google Fonts CDN as early as possible
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      // Preload the font CSS so the browser fetches it at high priority;
      // when the render-blocking stylesheet link below resolves, it reuses
      // the already-in-flight/cached response — effectively hiding the RTT.
      {
        rel: 'preload',
        as: 'style',
        href: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+SC:wght@400;500;700&display=optional',
      },
      // display=optional: fonts are used only when already cached — no swap
      // period means zero font-caused layout shift on any visit.
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Noto+Serif+SC:wght@400;500;700&display=optional',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
})

// ── USERNAME SETUP MODAL ───────────────────────────────────────────
const USERNAME_RE = /^[a-z0-9_]+$/

function UsernameSetupModal({ onDone }: { onDone: () => void }) {
  const trpc = useTRPC()
  const qc = useQueryClient()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const confirm = useMutation(
    trpc.social.confirmUsername.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.social.getMyProfile.queryKey() })
        onDone()
      },
      onError: (e) => setError(e.message),
    }),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v = value.trim().toLowerCase()
    if (v.length < 2) {
      setError('At least 2 characters required.')
      return
    }
    if (!USERNAME_RE.test(v)) {
      setError('Only lowercase letters, numbers, and underscores.')
      return
    }
    setError('')
    confirm.mutate({ username: v })
  }

  return (
    <div className="fc-username-gate-overlay">
      <div className="fc-username-gate-modal">
        <div className="fc-username-gate-char">你好</div>
        <h2 className="fc-username-gate-title">Choose your username</h2>
        <p className="fc-username-gate-sub">
          Pick a unique username so friends can find you. You can change it
          later.
        </p>
        <form className="fc-username-gate-form" onSubmit={handleSubmit}>
          <div className="fc-username-gate-input-wrap">
            <span className="fc-username-gate-at">@</span>
            <input
              ref={inputRef}
              className="fc-username-gate-input"
              type="text"
              placeholder="your_username"
              value={value}
              maxLength={30}
              onChange={(e) => {
                setValue(
                  e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                )
                setError('')
              }}
            />
          </div>
          {error && <div className="fc-username-gate-error">{error}</div>}
          <button
            className="fc-username-gate-btn"
            type="submit"
            disabled={value.trim().length < 2 || confirm.isPending}
          >
            {confirm.isPending ? 'Saving…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── ROOT LAYOUT ────────────────────────────────────────────────────
function RootLayout() {
  const { data: session, isPending: sessionPending } = authClient.useSession()
  const trpc = useTRPC()
  const [dismissed, setDismissed] = useState(false)

  const profileQuery = useQuery({
    ...trpc.social.getMyProfile.queryOptions(),
    enabled: !!session?.user,
  })

  const needsUsername =
    !dismissed &&
    !!session?.user &&
    !sessionPending &&
    !profileQuery.isPending &&
    profileQuery.data != null &&
    !profileQuery.data.usernameConfirmed

  return (
    <>
      <Outlet />
      {needsUsername && (
        <UsernameSetupModal onDone={() => setDismissed(true)} />
      )}
    </>
  )
}

// ── HTML SHELL ─────────────────────────────────────────────────────
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <TanStackQueryProvider>
          {children}
          <Analytics />
          <SpeedInsights />
          {DevToolsPanel && (
            <Suspense fallback={null}>
              <DevToolsPanel />
            </Suspense>
          )}
        </TanStackQueryProvider>
        <Scripts />
      </body>
    </html>
  )
}
