import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '$lib': path.resolve('./src/lib')
    }
  },
  server: {
    port: 5174,
    strictPort: false, // Allow fallback if port is busy
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
  }
})
