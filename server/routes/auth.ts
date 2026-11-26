import { Router, type Request, type Response } from 'express'
import type { Config } from '../config.ts'
import type { Db } from '../db.ts'
import { clearSessionCookie, HttpError, parse, requireAuth, setSessionCookie } from '../http.ts'
import { signInWithGoogle, type GoogleVerifier } from '../google.ts'
import { cleanUp } from '../maintenance.ts'
import { dummyHash, hashPassword, needsRehash, verifyPassword } from '../password.ts'
import { RateLimiter } from '../rateLimit.ts'
import { createSession, deleteSession, deleteUserSessions } from '../sessions.ts'
import { audit, findUserByEmail, findUserById, insertUser, publicUser, ROLE_IDS } from '../users.ts'
import { changePasswordBody, deleteAccountBody, googleBody, loginBody, signupBody } from '../validation.ts'

const MAX_FAILED_LOGINS = 10
const LOCK_MINUTES = 15

async function limit(limiter: RateLimiter, key: string) {
  const wait = await limiter.hit(key)
  if (wait) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.', { retryAfter: wait })
}

export interface AuthLimits {
  /** Logins per IP per 15 minutes. */
  loginPerIp: number
  /** Logins per email per 15 minutes. */
  loginPerEmail: number
  /** Sign-ups per IP per hour. */
  signupPerIp: number
  /** Google sign-ins per IP per 15 minutes. High, because a whole campus can share one IP. */
  googlePerIp?: number
}

export const DEFAULT_LIMITS: AuthLimits = { loginPerIp: 20, loginPerEmail: 10, signupPerIp: 10 }

export function authRoutes(db: Db, config: Config, limits: AuthLimits = DEFAULT_LIMITS, google: GoogleVerifier | null = null): Router {
  const router = Router()
  const scrypt = { N: config.SCRYPT_N, r: 8, p: 1 }
  const loginByIp = new RateLimiter(db, 'login-ip', limits.loginPerIp, 15 * 60)
  const loginByEmail = new RateLimiter(db, 'login-email', limits.loginPerEmail, 15 * 60)
  const signupByIp = new RateLimiter(db, 'signup-ip', limits.signupPerIp, 60 * 60)
  const googleByIp = new RateLimiter(db, 'google-ip', limits.googlePerIp ?? 300, 15 * 60)

  const startSession = async (req: Request, res: Response, userId: string) => {
    // A fresh token at every login, so a token planted before sign-in is useless after it.
    if (req.sessionToken) await deleteSession(db, req.sessionToken)
    const { token, expiresAt } = await createSession(db, userId, {
      ttlHours: config.SESSION_TTL_HOURS,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    })
    setSessionCookie(res, config, token, expiresAt)
    // Serverless has no background timer, so about 1 sign-in in 20 also clears out expired rows.
    if (Math.random() < 0.05) await cleanUp(db, config.SESSION_IDLE_HOURS).catch(() => {})
  }

  /** Which ways to sign in this server offers. */
  router.get('/options', (_req, res) => {
    res.json({ emailSignup: config.EMAIL_SIGNUP, google: google !== null })
  })

  router.post('/google', async (req, res) => {
    if (!google) throw new HttpError(503, 'Google sign-in is not set up on the server.')
    await limit(googleByIp, req.ip ?? '')
    const { credential } = parse(googleBody, req.body)
    const profile = await google(credential)
    if (!profile) throw new HttpError(401, 'Google sign-in did not work. Please try again.')
    const { user, created, passwordRemoved } = await signInWithGoogle(db, profile, req.ip)
    await startSession(req, res, user.id)
    res.status(created ? 201 : 200).json({ user: publicUser(user), passwordRemoved })
  })

  router.post('/signup', async (req, res) => {
    if (!config.EMAIL_SIGNUP) throw new HttpError(403, 'Creating an account with email is not available yet. Use Google instead.')
    await limit(signupByIp, req.ip ?? '')
    const body = parse(signupBody, req.body)
    const user = await insertUser(db, {
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password, scrypt),
      role: 'user', // Sign-up never grants admin. Admins promote accounts from the admin page.
    })
    if (!user) throw new HttpError(409, 'An account with this email already exists. Sign in instead.', { fields: { email: 'Already registered.' } })
    await audit(db, { action: 'user.signup', actorId: user.id, targetId: user.id, ip: req.ip })
    await startSession(req, res, user.id)
    res.status(201).json({ user: publicUser(user) })
  })

  router.post('/login', async (req, res) => {
    await limit(loginByIp, req.ip ?? '')
    const body = parse(loginBody, req.body)
    await limit(loginByEmail, body.email)

    const user = await findUserByEmail(db, body.email)
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`)
    }
    // Always run scrypt, so response time does not reveal whether the email exists.
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyHash(scrypt)))

    if (!user || !ok || !user.is_active) {
      if (user && !ok) {
        await db.query(
          // Lock after MAX_FAILED_LOGINS in a row, then start counting again.
          `UPDATE users SET failed_logins = CASE WHEN failed_logins + 1 >= $2 THEN 0 ELSE failed_logins + 1 END,
                  locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) END
            WHERE id = $1`,
          [user.id, MAX_FAILED_LOGINS, LOCK_MINUTES],
        )
        await audit(db, { action: 'login.failed', targetId: user.id, ip: req.ip })
      }
      // Same message for every failure, including disabled accounts.
      throw new HttpError(401, 'Incorrect email or password.')
    }

    const rehash = needsRehash(user.password_hash!, scrypt) ? await hashPassword(body.password, scrypt) : null
    await db.query(
      `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now(),
              password_hash = COALESCE($2, password_hash), updated_at = now()
        WHERE id = $1`,
      [user.id, rehash],
    )
    await loginByEmail.reset(body.email)
    await audit(db, { action: 'login.success', actorId: user.id, targetId: user.id, ip: req.ip })
    await startSession(req, res, user.id)
    res.json({ user: publicUser({ ...user, last_login_at: new Date() }) })
  })

  router.post('/logout', async (req, res) => {
    if (req.sessionToken) await deleteSession(db, req.sessionToken)
    clearSessionCookie(res, config)
    res.status(204).end()
  })

  /** Signs out every device, this one included. For a lost phone or a shared computer left signed in. */
  router.post('/logout-all', requireAuth, async (req, res) => {
    await deleteUserSessions(db, req.user!.id)
    await audit(db, { action: 'user.signed_out_everywhere', actorId: req.user!.id, targetId: req.user!.id, ip: req.ip })
    clearSessionCookie(res, config)
    res.status(204).end()
  })

  router.get('/me', requireAuth, async (req, res) => {
    const user = await findUserById(db, req.user!.id)
    if (!user) throw new HttpError(401, 'Please sign in.')
    res.json({ user: publicUser(user) })
  })

  router.post('/password', requireAuth, async (req, res) => {
    await limit(loginByIp, req.ip ?? '')
    const body = parse(changePasswordBody, req.body)
    const user = await findUserById(db, req.user!.id)
    if (user && !user.password_hash) throw new HttpError(400, 'This account signs in with Google, so it has no password.')
    if (!user || !(await verifyPassword(body.currentPassword, user.password_hash!))) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { currentPassword: 'That is not your current password.' } })
    }
    await db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [
      user.id,
      await hashPassword(body.newPassword, scrypt),
    ])
    // Sign out every other device.
    await deleteUserSessions(db, user.id, req.sessionToken)
    await audit(db, { action: 'user.password_changed', actorId: user.id, targetId: user.id, ip: req.ip })
    res.status(204).end()
  })

  /** Deletes the account and everything that belongs to it. There is no undo. */
  router.post('/delete', requireAuth, async (req, res) => {
    await limit(loginByIp, req.ip ?? '')
    const body = parse(deleteAccountBody, req.body)
    const user = await findUserById(db, req.user!.id)
    if (!user) throw new HttpError(401, 'Please sign in.')
    if (user.password_hash) {
      if (!body.password || !(await verifyPassword(body.password, user.password_hash))) {
        throw new HttpError(400, 'Check the highlighted fields.', { fields: { password: 'That is not your password.' } })
      }
    } else if (body.email !== user.email) {
      throw new HttpError(400, 'Check the highlighted fields.', { fields: { email: 'Type your account email exactly.' } })
    }
    await db.tx(async (t) => {
      if (user.role === 'admin') {
        // Lock the admins, so the last two cannot both leave at once.
        const { rows } = await t.query('SELECT id FROM users WHERE role_id = $1 AND is_active ORDER BY id FOR UPDATE', [ROLE_IDS.admin])
        if (!rows.some((r) => r.id !== user.id)) throw new HttpError(400, 'You are the only admin. Make someone else an admin first.')
      }
      // Sessions and identities go with the user. Past audit entries stay, without a link to the person.
      await t.query('DELETE FROM users WHERE id = $1', [user.id])
      await audit(t, { action: 'user.deleted' })
    })
    clearSessionCookie(res, config)
    res.status(204).end()
  })

  return router
}
