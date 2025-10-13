import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib')
    }
  },
  test: {
    globals: true,
    environment: 'node', // Use node environment for unit tests (no DOM needed)
    include: ['src/tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/e2e/**', // E2E tests use Playwright, run with `npx playwright test`
      '**/*.spec.ts', // Playwright uses .spec.ts convention
    ],
  }
})
