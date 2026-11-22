import type { Db } from './db.ts'
import { purgeRateLimits } from './rateLimit.ts'
import { purgeExpiredSessions } from './sessions.ts'

/** Deletes rows nobody can use any more: expired sessions and finished rate limit windows. */
export async function cleanUp(db: Db, idleHours: number): Promise<void> {
  await purgeExpiredSessions(db, idleHours)
  await purgeRateLimits(db)
}
