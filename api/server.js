import server from '../dist/server/server.js'

function getHeader(headers, name) {
  if (typeof headers.get === 'function') return headers.get(name)
  return headers[name.toLowerCase()] ?? null
}

export default async function handler(request) {
  if (!request.url.startsWith('http')) {
    const proto = getHeader(request.headers, 'x-forwarded-proto') ?? 'https'
    const host = getHeader(request.headers, 'x-forwarded-host') ?? getHeader(request.headers, 'host') ?? 'localhost'
    const url = `${proto}://${host}${request.url}`
    request = new Request(url, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    })
  }
  return server.fetch(request)
}
