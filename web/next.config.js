//const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')
const { NextResponse } = require('next/server')
const { match, compile } = require('next/dist/compiled/path-to-regexp')

// Public URL patterns and their internal Next page destinations. Shared with
// middleware for redirects from the legacy URLs.
const legacyRoutePatterns = [
  ['/go/settings/:uid', '/:uid/-/settings'],
  ...['children', 'incoming', 'tagged'].map(action => [
    `/go/user/:uid/${action}/:parentTopicId+`, `/:uid/:parentTopicId+/-/${action}`,
  ]),
  ...['articles', 'children', 'incoming', 'tagged', 'comments', 'files', 'discussions',
    'followed', 'follows', 'liked', 'liked-discussions', 'likes', 'likes-discussions',
    'follows-articles', 'follows-discussions'].map(action => [
    `/go/user/:uid/${action}`, `/:uid/-/${action}`,
  ]),
  ...['comments', 'discussions'].map(action => [
    `/go/${action}/:uid`, `/:uid/-/article/${action}`,
  ]),
  ...['comments', 'discussions', 'edit', 'delete', 'source', 'new', 'new-discussion'].map(action => [
    `/go/${action}/:slug+`, `/:slug+/-/${action}`,
  ]),
  ['/go/discussion/:number/:slug+', '/:slug+/-/discussion/:number'],
  ['/go/edit-discussion/:number/:slug+', '/:slug+/-/discussion/:number/edit'],
  ['/go/delete-discussion/:number/:slug+', '/:slug+/-/discussion/:number/delete'],
]

module.exports = phase => ({
  // Builds clean their output directory. Keep them away from the running dev
  // server's chunks and caches, including when NODE_ENV is set by our wrappers.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  async rewrites() {
    return { beforeFiles: [
      ...legacyRoutePatterns.map(([destination, source]) => ({ source, destination })),
      { source: '/-/:path*', destination: '/go/:path*' },
    ] }
  },
  eslint: {
    // Next.js 11 enables it by default, which is great. Being naughty until I get
    // the patience to fix i it.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.module.rules.push(
      {
        // To allow embedding the default defines into the Web Editor.
        test: /\.tex$/,
        type: 'asset/source',
      }
    );
    return config
  },
})

const redirects = [...legacyRoutePatterns, ['/go/:path*', '/-/:path*']].map(([source, destination]) => ({
  match: match(source),
  destination: compile(destination),
}))

// Middleware supplies x-nextjs-redirect for client navigation data requests;
// next.config redirects only supply Location, which is insufficient there.
function middleware(request) {
  for (const redirect of redirects) {
    const matched = redirect.match(request.nextUrl.pathname)
    if (matched) {
      const url = request.nextUrl.clone()
      url.pathname = redirect.destination(matched.params)
      // The Pages Router adds dynamic route parameters to data request queries.
      // They already belong to the path and must not leak into the redirect URL.
      if (request.headers.has('x-nextjs-data')) {
        for (const [key, value] of Object.entries(matched.params)) {
          const parts = (Array.isArray(value) ? value : [value]).map(part => decodeURIComponent(String(part)))
          const query = url.searchParams.getAll(key)
          if (query.length === parts.length && query.every((part, i) => part === parts[i])) {
            url.searchParams.delete(key)
          }
        }
      }
      return NextResponse.redirect(url, 308)
    }
  }
  return NextResponse.next()
}

module.exports.middleware = middleware
