import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { checkBundle } from './scripts/secrets.ts'

/** Fails the build when something private would be published. */
function noSecrets(): Plugin {
  let check = () => {}
  return {
    name: 'no-secrets',
    apply: 'build',
    configResolved({ root, mode, envDir, build }) {
      const env = { ...loadEnv(mode, envDir || root, ''), ...process.env }
      check = () => {
        const problems = checkBundle(path.resolve(root, build.outDir), env)
        if (problems.length) throw new Error(`Build stopped, so nothing private is published:\n- ${problems.join('\n- ')}`)
      }
    },
    closeBundle: {
      order: 'post',
      handler(error) {
        if (!error) check()
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves a project site from /<repo-name>/, so the deploy workflow sets BASE_PATH.
  // Locally it stays "/" and nothing changes.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), noSecrets()],
  // Source maps would publish the original code.
  build: { sourcemap: false },
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
