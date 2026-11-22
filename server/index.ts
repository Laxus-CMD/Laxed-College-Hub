import { readFileSync } from 'node:fs'
import { createServer as createHttp } from 'node:http'
import { createServer as createHttps } from 'node:https'
import { consoleLogger, createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { connectDb } from './db.ts'
import { cleanUp } from './maintenance.ts'
import { migrate } from './migrate.ts'
import { seedTestAccounts } from './seed.ts'

const log = consoleLogger
const config = loadConfig()
const db = await connectDb(config.DATABASE_URL!, {
  poolMax: config.DB_POOL_MAX,
  onIdleError: (err) => log.error('Idle database connection dropped', err),
})
await migrate(db, log.info)
if (config.SEED_TEST_ACCOUNTS) await seedTestAccounts(db, { N: config.SCRYPT_N, r: 8, p: 1 }, log.info)

const app = createApp(db, config, log)
const server =
  config.TLS_CERT_FILE && config.TLS_KEY_FILE
    ? createHttps({ cert: readFileSync(config.TLS_CERT_FILE), key: readFileSync(config.TLS_KEY_FILE), minVersion: 'TLSv1.2' }, app)
    : createHttp(app)

// Drop slow or stuck clients instead of holding sockets open.
server.requestTimeout = 30_000
server.headersTimeout = 20_000
server.keepAliveTimeout = 65_000

server.listen(config.PORT, config.HOST, () => {
  const scheme = config.TLS_CERT_FILE ? 'https' : 'http'
  log.info(`Listening on ${scheme}://${config.HOST}:${config.PORT} (${config.NODE_ENV}, db: ${config.DATABASE_URL!.startsWith('postgres') ? 'postgres' : 'pglite'})`)
})

const purge = setInterval(() => {
  cleanUp(db, config.SESSION_IDLE_HOURS).catch((err) => log.error('Cleanup failed', err))
}, 60 * 60_000)
purge.unref()

// Finish in-flight requests, then close the database, so deploys never cut a request in half.
let stopping = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (stopping) return
    stopping = true
    log.info(`${signal} received, shutting down`)
    setTimeout(() => process.exit(1), 10_000).unref()
    server.close(() => {
      db.close().finally(() => process.exit(0))
    })
  })
}
