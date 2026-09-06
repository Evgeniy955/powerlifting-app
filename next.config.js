/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/athletes/[athleteId]/ai-chat': [
      './docs/methodology/emerging-strategies.md',
    ],
  },
  // Explicit belt-and-suspenders: Next 15+ already defaults the client
  // Router Cache's staleTime for dynamic routes (like /gym/athletes, which
  // reads from the DB on every request) to 0 seconds. Pinning it here
  // guards against that default ever changing. Doesn't cover browser
  // back/forward navigation, which Next always serves from its snapshot
  // cache regardless of staleTimes — see AutoRefreshOnMount for that case.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
}

module.exports = nextConfig
