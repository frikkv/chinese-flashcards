import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/lib/auth'

// TanStack Start (via h3) passes the request with only the path as request.url
// (e.g. "/api/auth/get-session"). Better Auth's first action is new URL(request.url),
// which throws "TypeError: Invalid URL" for relative paths. We reconstruct an
// absolute URL using BETTER_AUTH_URL before handing off to auth.handler().
function withAbsoluteUrl(request: Request): Request {
  if (request.url.startsWith('http')) return request
  const base = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const absoluteUrl = new URL(request.url, base).toString()
  console.log('[auth] rewriting relative url:', request.url, '→', absoluteUrl)
  return new Request(absoluteUrl, request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        console.log('[auth] GET', request.url, '| BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL ?? 'MISSING')
        return auth.handler(withAbsoluteUrl(request))
      },
      POST: ({ request }) => {
        console.log('[auth] POST', request.url, '| BETTER_AUTH_URL:', process.env.BETTER_AUTH_URL ?? 'MISSING')
        return auth.handler(withAbsoluteUrl(request))
      },
    },
  },
})
