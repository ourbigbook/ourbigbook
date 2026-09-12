// Next discovers this hook by filename; the routing implementation lives in next.config.js.
export { middleware } from './next.config'

// Match the public URLs too: otherwise the Pages Router resolves their rewrite
// locally and fetches /go/... data, which redirects back to the public URL forever.
export const config = { matcher: ['/go/:path*', '/-/:path*', '/:scope+/-/:action*'] }
