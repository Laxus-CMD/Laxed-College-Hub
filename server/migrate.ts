import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Db } from './db.ts'

const DIR = path.join(import.meta.dirname, 'migrations')
/** Any fixed number, so concurrent migrations wait for each other. */
const LOCK = 727_001
const NAME = /^\d{3}_[a-z0-9_]+\.sql$/

/**
 * Applies migrations/NNN_name.sql in order, each in its own transaction, and
 * records them in schema_migrations. Safe to run on every start.
 */
export async function migrate(db: Db, log: (msg: string) => void = () => {}): Promise<string[]> {
  await db.tx(async (t) => {
    await t.query('SELECT pg_advisory_xact_lock($1)', [LOCK])
    await t.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
  })
  const files = (await readdir(DIR)).filter((f) => NAME.test(f)).sort()
  const applied: string[] = []
  for (const file of files) {
    const sql = await readFile(path.join(DIR, file), 'utf8')
    const ran = await db.tx(async (t) => {
      // Two deploys at once take turns here, and the second one sees the first one's work.
      await t.query('SELECT pg_advisory_xact_lock($1)', [LOCK])
      const { rows } = await t.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file])
      if (rows.length) return false
      await t.exec(sql)
      await t.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      return true
    })
    if (!ran) continue
    applied.push(file)
    log(`Applied migration ${file}`)
  }
  return applied
}
