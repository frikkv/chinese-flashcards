import server from '../dist/server/server.js'

// Vercel's Node.js runtime passes a plain-object request (headers is a dict,
// not a Headers instance). We must reconstruct an absolute URL before handing
// off to TanStack Start, which calls new URL(request.url) without a base and
// throws "TypeError: Invalid URL" for path-only inputs.
export default async function handler(request) {
  // headers may be a Web Headers instance or a plain Node.js headers object
  const getHeader = (name) => {
    if (typeof request.headers?.get === 'function') {
      return request.headers.get(name)
    }
    // Node.js IncomingMessage headers — keys are lowercase
    return request.headers?.[name.toLowerCase()] ?? null
  }

  if (!request.url.startsWith('http')) {
    const proto = getHeader('x-forwarded-proto') ?? 'https'
    const host =
      getHeader('x-forwarded-host') ??
      getHeader('host') ??
      'localhost'
    const absoluteUrl = `${proto}://${host}${request.url}`
    console.log('[server] rewriting relative url:', request.url, '→', absoluteUrl)
    // Reconstruct as a proper Web Request so server.fetch receives the right type
    request = new Request(absoluteUrl, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method?.toUpperCase()) ? undefined : request.body,
    })
  }

  return server.fetch(request)
}
