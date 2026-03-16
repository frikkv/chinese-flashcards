import server from '../dist/server/server.js'

// Vercel's Node.js runtime may pass a Web Request where request.url is only
// the path (e.g. "/api/auth/get-session"). Both TanStack Start's
// getNormalizedURL and Better Auth's better-call router call new URL(request.url)
// without a base, which throws TypeError: Invalid URL for relative inputs.
//
// We reconstruct an absolute URL from the x-forwarded-proto / host headers
// before handing off to the server bundle, making all downstream URL parsing safe.
export default async function handler(request) {
  if (!request.url.startsWith('http')) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const host =
      request.headers.get('x-forwarded-host') ??
      request.headers.get('host') ??
      'localhost'
    const absoluteUrl = `${proto}://${host}${request.url}`
    console.log('[server] rewriting relative url:', request.url, '→', absoluteUrl)
    request = new Request(absoluteUrl, request)
  }
  return server.fetch(request)
}
