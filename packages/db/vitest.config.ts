import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
    hookTimeout: 30000,
    fileParallelism: false,
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
