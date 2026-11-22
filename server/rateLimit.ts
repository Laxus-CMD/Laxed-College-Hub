import { createHash } from 'node:crypto'
import type { Db } from './db.ts'

/**
 * Fixed-window rate limiter kept in the database, so every API instance shares
 * the same counts. Each hit is one atomic upsert.
 */
export class RateLimiter {
  private readonly db: Db
  private readonly name: string
  private readonly limit: number
  private readonly windowSeconds: number

  constructor(db: Db, name: string, limit: number, windowSeconds: number) {
    this.db = db
    this.name = name
    this.limit = limit
    this.windowSeconds = windowSeconds
  }

  /** Counts a hit. Returns 0 when allowed, or the seconds to wait. */
  async hit(key: string): Promise<number> {
    const { rows } = await this.db.query<{ hits: number; wait: number }>(
      `INSERT INTO rate_limits AS r (key_hash, hits, reset_at)
       VALUES ($1, 1, now() + make_interval(secs => $2))
       ON CONFLICT (key_hash) DO UPDATE SET
         hits     = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.hits + 1 END,
         reset_at = CASE WHEN r.reset_at <= now() THEN excluded.reset_at ELSE r.reset_at END
       RETURNING hits, GREATEST(1, ceil(extract(epoch FROM reset_at - now())))::int AS wait`,
      [this.hash(key), this.windowSeconds],
    )
    const row = rows[0]!
    return row.hits > this.limit ? row.wait : 0
  }

  async reset(key: string): Promise<void> {
    await this.db.query('DELETE FROM rate_limits WHERE key_hash = $1', [this.hash(key)])
  }

  private hash(key: string): string {
    return createHash('sha256').update(`${this.name}\n${key}`).digest('hex')
  }
}

export async function purgeRateLimits(db: Db): Promise<void> {
  await db.query('DELETE FROM rate_limits WHERE reset_at <= now()')
}
