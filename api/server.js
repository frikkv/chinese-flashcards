import server from '../dist/server/server.js'

export default async function handler(request) {
  if (!request.url.startsWith('http')) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https'
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost'
    request = new Request(`${proto}://${host}${request.url}`, request)
  }
  return server.fetch(request)
}
