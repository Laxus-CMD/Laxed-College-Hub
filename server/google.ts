import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey } from 'jose'
import type { Db } from './db.ts'
import { HttpError } from './http.ts'
import { deleteUserSessions } from './sessions.ts'
import { audit, findUserByEmail, findUserById, insertUser, type UserRow } from './users.ts'
import { email as emailRule } from './validation.ts'

export interface GoogleProfile {
  /** Google's permanent account id. */
  sub: string
  email: string
  name: string
  picture: string | null
  /** True when Google itself runs the mailbox (Gmail or Google Workspace), so the email is proof of ownership. */
  authoritative: boolean
}

/** Checks a Google ID token. Resolves to null when the token is not valid for this app. */
export type GoogleVerifier = (credential: string) => Promise<GoogleProfile | null>

const KEYS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')

/** Errors that mean "could not check" rather than "bad token". */
const UNAVAILABLE = new Set(['ERR_JWKS_TIMEOUT', 'ERR_JOSE_GENERIC'])

function cleanName(value: unknown, email: string): string {
  const name = typeof value === 'string' ? value.replace(/[\p{C}<>]/gu, '').trim() : ''
  return [...(name || email.split('@')[0]!)].slice(0, 60).join('')
}

function cleanPicture(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 500 || !URL.canParse(value)) return null
  const url = new URL(value)
  return url.protocol === 'https:' && url.hostname.endsWith('.googleusercontent.com') ? url.href : null
}

export function googleVerifier(clientId: string, keys: JWTVerifyGetKey = createRemoteJWKSet(KEYS_URL)): GoogleVerifier {
  return async (credential) => {
    let claims: Record<string, unknown>
    try {
      const { payload } = await jwtVerify(credential, keys, {
        audience: clientId,
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'email', 'exp', 'iat'],
        clockTolerance: 10,
      })
      claims = payload
    } catch (err) {
      if (err instanceof errors.JOSEError && !UNAVAILABLE.has(err.code)) return null
      throw new HttpError(503, 'Could not reach Google to check your sign-in. Please try again.')
    }
    const email = emailRule.safeParse(claims.email)
    if (!email.success || claims.email_verified !== true || typeof claims.sub !== 'string') return null
    return {
      sub: claims.sub,
      email: email.data,
      name: cleanName(claims.name, email.data),
      picture: cleanPicture(claims.picture),
      authoritative: email.data.endsWith('@gmail.com') || (typeof claims.hd === 'string' && claims.hd !== ''),
    }
  }
}

/**
 * Finds, links or creates the account for a checked Google profile.
 *
 * Email sign-up does not verify addresses, so someone could have registered
 * this email first. Linking to an unverified account therefore removes its
 * password and ends its sessions: only the mailbox owner keeps access.
 */
export async function signInWithGoogle(
  db: Db,
  profile: GoogleProfile,
  ip?: string,
): Promise<{ user: UserRow; created: boolean; passwordRemoved: boolean }> {
  return db.tx(async (t) => {
    // Two tabs signing in for the first time at once take turns.
    await t.query('SELECT pg_advisory_xact_lock(hashtext($1))', [profile.email])

    const { rows } = await t.query<{ user_id: string }>(
      `SELECT user_id FROM auth_identities WHERE provider = 'google' AND subject = $1`,
      [profile.sub],
    )
    let userId = rows[0]?.user_id
    let created = false
    let passwordRemoved = false

    if (!userId) {
      const existing = await findUserByEmail(t, profile.email)
      if (existing) {
        // A different Google account with the same address: the address changed hands.
        if (existing.has_google || !profile.authoritative) {
          throw new HttpError(409, 'An account with this email already exists and could not be linked to this Google account.')
        }
        if (!existing.is_active) throw new HttpError(403, 'This account is disabled. Contact an admin.')
        userId = existing.id
        if (!existing.email_verified_at) {
          passwordRemoved = existing.has_password
          await t.query('UPDATE users SET password_hash = NULL WHERE id = $1', [userId])
          await deleteUserSessions(t, userId)
        }
        await audit(t, { action: 'google.linked', actorId: userId, targetId: userId, detail: { passwordRemoved }, ip })
      } else {
        const user = await insertUser(t, { email: profile.email, name: profile.name, passwordHash: null, role: 'user' })
        if (!user) throw new HttpError(409, 'An account with this email was just created. Please try again.')
        userId = user.id
        created = true
        await audit(t, { action: 'user.signup', actorId: userId, targetId: userId, detail: { via: 'google' }, ip })
      }
      await t.query(`INSERT INTO auth_identities (provider, subject, user_id) VALUES ('google', $1, $2)`, [profile.sub, userId])
    }

    const user = await findUserById(t, userId)
    if (!user?.is_active) throw new HttpError(403, 'This account is disabled. Contact an admin.')
    await t.query(
      `UPDATE users SET last_login_at = now(), updated_at = now(), picture_url = $2,
              email_verified_at = CASE WHEN lower(email) = $3 THEN COALESCE(email_verified_at, now()) ELSE email_verified_at END
        WHERE id = $1`,
      [userId, profile.picture, profile.email],
    )
    if (!created) await audit(t, { action: 'login.success', actorId: userId, targetId: userId, detail: { via: 'google' }, ip })
    return { user: (await findUserById(t, userId))!, created, passwordRemoved }
  })
}
