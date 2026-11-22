import { z } from 'zod'

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : v === 'true' || v === '1'))

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().optional(),
  PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  /**
   * postgres://… for a real server. Anything else is a PGlite data directory
   * (embedded Postgres, for local development only), or `memory://` for tests.
   */
  DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Comma-separated list of origins allowed to call the API with cookies. */
  APP_ORIGIN: z.string().default('http://localhost:5173'),
  /** Number of proxy hops to trust for X-Forwarded-* (1 behind Render, Fly, Railway or a load balancer). */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(24 * 7),
  SESSION_IDLE_HOURS: z.coerce.number().positive().default(24),
  /** scrypt cost (a power of two). 2^17 follows OWASP; tests lower it for speed. */
  SCRYPT_N: z.coerce.number().int().min(2 ** 10).default(2 ** 17),
  /** Serve HTTPS directly. Usually TLS ends at the host's proxy and these stay empty. */
  TLS_CERT_FILE: z.string().optional(),
  TLS_KEY_FILE: z.string().optional(),
  /** Redirect plain HTTP to HTTPS (uses X-Forwarded-Proto, so set TRUST_PROXY too). Defaults on in production. */
  FORCE_HTTPS: bool,
  /** Create the test accounts on startup. Defaults on outside production, never in production. */
  SEED_TEST_ACCOUNTS: bool,
})

export type Config = Omit<z.infer<typeof schema>, 'APP_ORIGIN' | 'FORCE_HTTPS' | 'SEED_TEST_ACCOUNTS'> & {
  APP_ORIGINS: string[]
  FORCE_HTTPS: boolean
  SEED_TEST_ACCOUNTS: boolean
  isProduction: boolean
  HOST: string
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = schema.safeParse(env)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid server configuration:\n${lines.join('\n')}`)
  }
  const c = parsed.data
  const isProduction = c.NODE_ENV === 'production'

  if (isProduction && !/^postgres(ql)?:\/\//.test(c.DATABASE_URL ?? '')) {
    throw new Error('DATABASE_URL must be a postgres:// URL in production. PGlite is for local development only.')
  }
  if (c.SEED_TEST_ACCOUNTS && isProduction) {
    throw new Error('SEED_TEST_ACCOUNTS cannot be on in production. Create real admin accounts with `npm run db:create-admin`.')
  }
  if (Boolean(c.TLS_CERT_FILE) !== Boolean(c.TLS_KEY_FILE)) {
    throw new Error('Set both TLS_CERT_FILE and TLS_KEY_FILE, or neither.')
  }

  const APP_ORIGINS = c.APP_ORIGIN.split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  return {
    ...c,
    HOST: c.HOST ?? (isProduction ? '0.0.0.0' : '127.0.0.1'),
    DATABASE_URL: c.DATABASE_URL ?? (c.NODE_ENV === 'test' ? 'memory://' : 'server/.data/pglite'),
    APP_ORIGINS,
    FORCE_HTTPS: c.FORCE_HTTPS ?? isProduction,
    SEED_TEST_ACCOUNTS: c.SEED_TEST_ACCOUNTS ?? !isProduction,
    isProduction,
  }
}
