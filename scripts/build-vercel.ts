/**
 * Builds the whole Vercel deployment into .vercel/output (Build Output API v3):
 * the site as static files and the API as one function. Doing it here means the
 * result does not depend on how Vercel compiles TypeScript.
 *
 *   npm run build:vercel
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'vite'
import { connectDb, verifiedTls } from '../server/db.ts'
import { migrate } from '../server/migrate.ts'
import { siteHeaders } from './siteHeaders.ts'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.vercel', 'output')
const fn = path.join(out, 'functions', 'api.func')
const { VERCEL_ENV, DATABASE_URL, DATABASE_URL_UNPOOLED, MIGRATE_PREVIEW_DB } = process.env

if (VERCEL_ENV === 'production' && !DATABASE_URL) {
  // Failing here keeps the previous deployment live.
  throw new Error('DATABASE_URL is not set for Production. Connect the database in Vercel, then redeploy.')
}
if (!DATABASE_URL) console.warn('DATABASE_URL is not set, so the API in this deployment will answer 503.')

// 1. The site. (`npm run build:vercel` type-checks first.)
await build({ root })

// 2. The API, bundled to one plain JavaScript file.
await rm(out, { recursive: true, force: true })
await build({
  root,
  configFile: false,
  publicDir: false,
  logLevel: 'warn',
  ssr: { noExternal: true, target: 'node' },
  build: {
    ssr: path.join(root, 'server/vercel.ts'),
    outDir: fn,
    target: 'node24',
    rolldownOptions: {
      // PGlite is for local development, and pg-native is optional. Neither is ever loaded on Vercel.
      external: ['@electric-sql/pglite', 'pg-native'],
      output: { format: 'es', entryFileNames: 'index.mjs', codeSplitting: false },
    },
  },
})
await writeFile(
  path.join(fn, '.vc-config.json'),
  JSON.stringify({
    runtime: 'nodejs24.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    // Helpers would read the request body before Express can.
    shouldAddHelpers: false,
    maxDuration: 30,
    regions: ['sin1'], // Singapore: next to the database and to DLSU students.
  }),
)

// 3. Put them together.
await mkdir(out, { recursive: true })
await cp(path.join(root, 'dist'), path.join(out, 'static'), { recursive: true })
await writeFile(
  path.join(out, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      {
        // The API sets its own, stricter headers.
        src: '^/(?!api(?:/|$)).*$',
        headers: siteHeaders(path.join(root, 'dist')),
        continue: true,
      },
      { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
      { src: '^/api(?:/.*)?$', dest: '/api' },
      { handle: 'filesystem' },
    ],
  }),
)

// 4. Migrate last, so a broken build never touches the database.
// Previews only migrate when told their database is separate from production.
if (DATABASE_URL && (VERCEL_ENV === 'production' || (VERCEL_ENV === 'preview' && MIGRATE_PREVIEW_DB === 'true'))) {
  // A direct connection when there is one. Poolers are meant for short queries.
  const db = await connectDb(verifiedTls(DATABASE_URL_UNPOOLED ?? DATABASE_URL), { poolMax: 1 })
  try {
    const applied = await migrate(db, console.log)
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : 'Database is up to date.')
  } finally {
    await db.close()
  }
}
console.log('Vercel output is ready in .vercel/output')
