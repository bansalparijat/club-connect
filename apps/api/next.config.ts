import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // API-only app — no pages/frontend
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma'],
  },
  // Allow larger payloads for bulk import
  serverRuntimeConfig: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default nextConfig
