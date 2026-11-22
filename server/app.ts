import express from 'express'
import helmet from 'helmet'
import type { Config } from './config.ts'
import type { Db } from './db.ts'
import { googleVerifier, type GoogleVerifier } from './google.ts'
import { csrfGuard, errorHandler, HttpError, httpsOnly, loadSession } from './http.ts'
import { adminRoutes } from './routes/admin.ts'
import { authRoutes, DEFAULT_LIMITS, type AuthLimits } from './routes/auth.ts'
import { dataRoutes, type DataLimits } from './routes/data.ts'

export interface Logger {
  info(msg: string): void
  error(msg: string, err?: unknown): void
}

export const consoleLogger: Logger = {
  info: (msg) => console.log(`[api] ${msg}`),
  error: (msg, err) => console.error(`[api] ${msg}`, err),
}

export function createApp(
  db: Db,
  config: Config,
  log: Logger = consoleLogger,
  limits: AuthLimits = DEFAULT_LIMITS,
  google: GoogleVerifier | null = config.GOOGLE_CLIENT_ID ? googleVerifier(config.GOOGLE_CLIENT_ID) : null,
  dataLimits?: DataLimits,
) {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', config.TRUST_PROXY)

  // The API only returns JSON, so the strictest CSP applies. HSTS only over HTTPS.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      strictTransportSecurity: config.isProduction ? { maxAge: 63_072_000, includeSubDomains: true, preload: false } : false,
    }),
  )
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  app.use(httpsOnly(config))

  if (config.NODE_ENV !== 'test') {
    app.use((req, res, next) => {
      const start = performance.now()
      // Method, path and status only. Never bodies, cookies or query strings.
      res.on('finish', () => log.info(`${req.method} ${req.originalUrl.split('?')[0]} ${res.statusCode} ${Math.round(performance.now() - start)}ms`))
      next()
    })
  }

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('SELECT 1')
      res.json({ ok: true })
    } catch {
      res.status(503).json({ ok: false })
    }
  })

  app.use('/api', csrfGuard(config), loadSession(db, config))
  // Reads its own, bigger bodies.
  app.use('/api/data', dataRoutes(db, dataLimits))
  app.use('/api', express.json({ limit: '10kb' }))
  app.use('/api/auth', authRoutes(db, config, limits, google))
  app.use('/api/admin', adminRoutes(db))
  app.use('/api', () => {
    throw new HttpError(404, 'Not found.')
  })

  app.use(errorHandler(log.error))
  return app
}
