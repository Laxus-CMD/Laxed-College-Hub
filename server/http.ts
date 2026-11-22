import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { Config } from './config.ts'
import type { Db } from './db.ts'
import { findSession, type Role, type SessionUser } from './sessions.ts'

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser
    sessionToken?: string
  }
}

/** An error with an HTTP status and a message that is safe to show the user. */
export class HttpError extends Error {
  readonly status: number
  readonly fields?: Record<string, string>
  readonly retryAfter?: number

  constructor(status: number, message: string, extra: { fields?: Record<string, string>; retryAfter?: number } = {}) {
    super(message)
    this.status = status
    this.fields = extra.fields
    this.retryAfter = extra.retryAfter
  }
}

/** `__Host-` makes the browser refuse the cookie unless it is Secure, host-only and Path=/. */
export const cookieName = (config: Config) => (config.isProduction ? '__Host-sid' : 'sid')

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim()
      return /^[A-Za-z0-9_-]{20,100}$/.test(value) ? value : undefined
    }
  }
  return undefined
}

export function setSessionCookie(res: Response, config: Config, token: string, expiresAt: Date): void {
  res.cookie(cookieName(config), token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(res: Response, config: Config): void {
  res.clearCookie(cookieName(config), { httpOnly: true, secure: config.isProduction, sameSite: 'lax', path: '/' })
}

/** Loads the signed-in user, if any, onto req.user. */
export function loadSession(db: Db, config: Config): RequestHandler {
  return async (req, _res, next) => {
    const token = readCookie(req, cookieName(config))
    if (token) {
      const user = await findSession(db, token, config.SESSION_IDLE_HOURS)
      if (user) {
        req.user = user
        req.sessionToken = token
      }
    }
    next()
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new HttpError(401, 'Please sign in.')
  next()
}

/** Role-based access control. The server is the only place this is enforced; the UI just hides what you cannot use. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new HttpError(401, 'Please sign in.')
    if (!roles.includes(req.user.role)) throw new HttpError(403, 'You do not have access to this.')
    next()
  }
}

/**
 * CSRF defence on top of SameSite=Lax cookies: state-changing requests must
 * send JSON (which a cross-site form cannot do without a CORS preflight we
 * never approve) and, when the browser sends an Origin, it must be ours.
 */
export function csrfGuard(config: Config): RequestHandler {
  const allowed = new Set(config.APP_ORIGINS)
  return (req, _res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const origin = req.headers.origin
    if (origin && !allowed.has(origin)) throw new HttpError(403, 'Request blocked: unknown origin.')
    if (!origin && req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Request blocked: cross-site.')
    if (req.headers['content-length'] !== '0' && !req.is('application/json')) {
      throw new HttpError(415, 'Send JSON with Content-Type: application/json.')
    }
    next()
  }
}

/** Redirects HTTP to HTTPS when the proxy says the request came in over HTTP. */
export function httpsOnly(config: Config): RequestHandler {
  return (req, res, next) => {
    if (!config.FORCE_HTTPS || req.secure || req.path === '/api/health') return next()
    if (req.method === 'GET' || req.method === 'HEAD') return res.redirect(308, `https://${req.hostname}${req.originalUrl}`)
    throw new HttpError(403, 'Use HTTPS.')
  }
}

export function errorHandler(log: (msg: string, err?: unknown) => void) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      if (err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter))
      res.status(err.status).json({ error: err.message, ...(err.fields ? { fields: err.fields } : {}) })
      return
    }
    // Body parser errors (bad JSON, too large) carry a status.
    const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode
    if (status && status >= 400 && status < 500) {
      res.status(status).json({ error: status === 413 ? 'Request is too large.' : 'Could not read the request.' })
      return
    }
    log('Unhandled error', err)
    res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
  }
}
