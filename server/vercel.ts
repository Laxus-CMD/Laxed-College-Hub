/**
 * The API as a Vercel Function. scripts/build-vercel.ts bundles this file into
 * plain JavaScript. Migrations run during the deploy, never here.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { consoleLogger, createApp, type Logger } from './app.ts'
import { loadConfig, type Config } from './config.ts'
import { connectDb, verifiedTls } from './db.ts'

type Env = Record<string, string | undefined>
type Handler = (req: IncomingMessage, res: ServerResponse) => void

/** Fills in what Vercel already knows. Deployments always run in production mode. */
export function vercelConfig(env: Env): Config {
  const hosts = env.VERCEL_ENV === 'production' ? [env.VERCEL_PROJECT_PRODUCTION_URL] : [env.VERCEL_URL, env.VERCEL_BRANCH_URL]
  const own = hosts.filter(Boolean).map((host) => `https://${host}`)
  const origins = [...(env.APP_ORIGIN ? [env.APP_ORIGIN] : []), ...own].join(',')
  return loadConfig({
    ...env,
    NODE_ENV: 'production',
    // Vercel's proxy is the one hop in front of the function.
    TRUST_PROXY: env.TRUST_PROXY ?? '1',
    // Many small instances share one database, so each keeps few connections.
    DB_POOL_MAX: env.DB_POOL_MAX ?? '5',
    ...(origins ? { APP_ORIGIN: origins } : {}),
  })
}

export function createHandler(env: Env, log: Logger = consoleLogger) {
  // Kept between requests while the instance is warm.
  let app: Promise<Handler> | null = null

  const start = async (): Promise<Handler> => {
    const config = vercelConfig(env)
    const db = await connectDb(verifiedTls(config.DATABASE_URL!), {
      poolMax: config.DB_POOL_MAX,
      idleTimeoutMs: 5_000,
      onIdleError: (err) => log.error('Idle database connection dropped', err),
    })
    return createApp(db, config, log)
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    let handle: Handler
    try {
      app ??= start()
      handle = await app
    } catch (err) {
      // Try again on the next request instead of remembering the failure.
      app = null
      log.error('API could not start', err)
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('Retry-After', '5')
      res.end(JSON.stringify({ error: 'College Hub is temporarily unavailable. Please try again soon.' }))
      return
    }
    handle(req, res)
  }
}

export default createHandler(process.env)
