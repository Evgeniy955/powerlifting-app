/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: {
    '/api/athletes/[athleteId]/ai-chat': [
      './docs/methodology/emerging-strategies.md',
    ],
  },
}

module.exports = nextConfig
