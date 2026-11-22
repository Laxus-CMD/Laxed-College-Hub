import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, so the deploy workflow sets BASE_PATH.
  // Locally it stays "/" and nothing changes.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  // `npm run dev:api` serves the accounts API on 8787. Proxying keeps it same-origin, so the
  // session cookie stays first-party, exactly like the Vercel rewrite in production.
  server: {
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787' } },
  },
  preview: {
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8787' } },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    // Starting the embedded Postgres can be slow on a busy machine.
    hookTimeout: 60_000,
  },
})
