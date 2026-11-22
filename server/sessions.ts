import { createHash, randomBytes } from 'node:crypto'
import type { Db, Queryable } from './db.ts'

/**
 * Server-side sessions. The browser holds a random 256-bit token in an
 * HttpOnly cookie; the database holds only its SHA-256. Sessions end on
 * logout, after SESSION_IDLE_HOURS without use, or SESSION_TTL_HOURS after
 * login, whichever comes first.
 */

export type Role = 'admin' | 'user'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: Role
  createdAt: string
}

/** Devices signed in at once. Signing in on one more ends the one unused the longest. */
export const MAX_SESSIONS = 10

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function createSession(
  db: Db,
  userId: string,
  { ttlHours, ip, userAgent }: { ttlHours: number; ip?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + ttlHours * 3_600_000)
  await db.query('INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5)', [
    hashToken(token),
    userId,
    expiresAt,
    ip ?? null,
    userAgent?.slice(0, 300) ?? null,
  ])
  await db.query(
    `DELETE FROM sessions WHERE id IN (
       SELECT id FROM sessions WHERE user_id = $1 AND id <> $2 ORDER BY last_seen_at DESC, created_at DESC OFFSET $3)`,
    [userId, hashToken(token), MAX_SESSIONS - 1],
  )
  return { token, expiresAt }
}

interface Row {
  id: string
  email: string
  name: string
  role: Role
  created_at: Date
  last_seen_at: Date
}

export async function findSession(db: Db, token: string, idleHours: number): Promise<SessionUser | null> {
  const id = hashToken(token)
  const { rows } = await db.query<Row>(
    `SELECT u.id, u.email, u.name, r.name AS role, u.created_at, s.last_seen_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       JOIN roles r ON r.id = u.role_id
      WHERE s.id = $1
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(secs => $2)
        AND u.is_active`,
    [id, idleHours * 3600],
  )
  const row = rows[0]
  if (!row) return null
  // Slide the idle window, at most once every five minutes to save writes.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [id])
  }
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: new Date(row.created_at).toISOString() }
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE id = $1', [hashToken(token)])
}

/** Signs a user out everywhere, optionally keeping the current session. */
export async function deleteUserSessions(db: Queryable, userId: string, keepToken?: string): Promise<void> {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, keepToken ? hashToken(keepToken) : ''])
}

export async function purgeExpiredSessions(db: Db, idleHours: number): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `WITH gone AS (
       DELETE FROM sessions WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(secs => $1) RETURNING 1
     ) SELECT count(*)::int AS n FROM gone`,
    [idleHours * 3600],
  )
  return rows[0]?.n ?? 0
}
