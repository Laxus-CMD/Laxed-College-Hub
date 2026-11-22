import type { Queryable } from './db.ts'
import type { Role } from './sessions.ts'

export const ROLE_IDS: Record<Role, number> = { admin: 1, user: 2 }

export interface UserRow {
  id: string
  email: string
  name: string
  role: Role
  /** Null for accounts that only use Google. */
  password_hash: string | null
  is_active: boolean
  failed_logins: number
  locked_until: Date | null
  last_login_at: Date | null
  created_at: Date
  email_verified_at: Date | null
  picture_url: string | null
  has_password: boolean
  has_google: boolean
}

/** How an account can sign in, without exposing the hash. */
export const SIGN_IN_COLUMNS = `u.picture_url, u.password_hash IS NOT NULL AS has_password,
  EXISTS (SELECT 1 FROM auth_identities i WHERE i.user_id = u.id AND i.provider = 'google') AS has_google`

const SELECT = `SELECT u.id, u.email, u.name, r.name AS role, u.password_hash, u.is_active, u.failed_logins,
                       u.locked_until, u.last_login_at, u.created_at, u.email_verified_at, ${SIGN_IN_COLUMNS}
                  FROM users u JOIN roles r ON r.id = u.role_id`

export async function findUserByEmail(db: Queryable, email: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`${SELECT} WHERE lower(u.email) = lower($1)`, [email])
  return rows[0] ?? null
}

export async function findUserById(db: Queryable, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(`${SELECT} WHERE u.id = $1`, [id])
  return rows[0] ?? null
}

/** Returns null when the email is taken. */
export async function insertUser(
  db: Queryable,
  u: { email: string; name: string; passwordHash: string | null; role: Role },
): Promise<UserRow | null> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, role_id) VALUES ($1, $2, $3, $4)
     ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`,
    [u.email, u.name, u.passwordHash, ROLE_IDS[u.role]],
  )
  return rows[0] ? findUserById(db, rows[0].id) : null
}

/** The public shape of a user. Never includes the password hash. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    isActive: u.is_active,
    lastLoginAt: u.last_login_at ? new Date(u.last_login_at).toISOString() : null,
    createdAt: new Date(u.created_at).toISOString(),
    picture: u.picture_url,
    hasPassword: u.has_password,
    hasGoogle: u.has_google,
  }
}

export async function audit(
  db: Queryable,
  e: { action: string; actorId?: string | null; targetId?: string | null; detail?: Record<string, unknown>; ip?: string },
): Promise<void> {
  await db.query('INSERT INTO audit_log (action, actor_id, target_id, detail, ip) VALUES ($1, $2, $3, $4, $5)', [
    e.action,
    e.actorId ?? null,
    e.targetId ?? null,
    JSON.stringify(e.detail ?? {}),
    e.ip ?? null,
  ])
}
