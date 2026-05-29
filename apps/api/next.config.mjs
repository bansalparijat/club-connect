/** @type {import('next').NextConfig} */
const nextConfig = {
  // API-only app — no pages/frontend
  output: 'standalone',
  // Allow larger payloads for bulk import
  serverRuntimeConfig: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

export default nextConfig
