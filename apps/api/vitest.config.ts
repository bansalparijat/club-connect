import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    setupFiles: ['./src/__tests__/setup.ts'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@club-connect/db': path.resolve(__dirname, '../../packages/db/src'),
      '@club-connect/notifications': path.resolve(__dirname, '../../packages/notifications/src'),
      '@club-connect/types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
})
