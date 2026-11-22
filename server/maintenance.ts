import type { Db } from './db.ts'
import { purgeRateLimits } from './rateLimit.ts'
import { purgeExpiredSessions } from './sessions.ts'

/** The Privacy Policy promises about 90 days. The log holds IP addresses. */
export const AUDIT_DAYS = 90

/** Deletes rows nobody needs any more: expired sessions, finished rate limit windows and old security log entries. */
export async function cleanUp(db: Db, idleHours: number): Promise<void> {
  await purgeExpiredSessions(db, idleHours)
  await purgeRateLimits(db)
  await db.query('DELETE FROM audit_log WHERE created_at < now() - make_interval(days => $1)', [AUDIT_DAYS])
}
