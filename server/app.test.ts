// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { connectDb, type Db } from './db.ts'
import { cleanUp } from './maintenance.ts'
import { migrate } from './migrate.ts'
import { hashPassword, needsRehash, verifyPassword } from './password.ts'
import { RateLimiter } from './rateLimit.ts'
import { seedTestAccounts, TEST_ACCOUNTS } from './seed.ts'
import { createHandler, vercelConfig } from './vercel.ts'

const ORIGIN = 'http://localhost:5173'
const config = loadConfig({ NODE_ENV: 'test', SCRYPT_N: String(2 ** 12), APP_ORIGIN: ORIGIN })
const scrypt = { N: config.SCRYPT_N, r: 8, p: 1 }
const [ADMIN, STUDENT] = TEST_ACCOUNTS as [(typeof TEST_ACCOUNTS)[0], (typeof TEST_ACCOUNTS)[0]]

let db: Db
let server: Server
let base: string

beforeAll(async () => {
  db = await connectDb('memory://')
  await migrate(db)
  await seedTestAccounts(db, scrypt)
  server = createApp(db, config, { info: () => {}, error: () => {} }, { loginPerIp: 1000, loginPerEmail: 50, signupPerIp: 1000 }).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  await db.close()
})

/** A tiny cookie-keeping client, like a browser tab. */
function client() {
  let cookie = ''
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        origin: ORIGIN,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]!.endsWith('=') ? '' : set.split(';')[0]!
    const text = await res.text()
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, setCookie: set }
  }
  return { call, get cookie() { return cookie } }
}

const login = async (email: string, password: string) => {
  const c = client()
  const res = await c.call('POST', '/auth/login', { email, password })
  return { c, res }
}

describe('password hashing', () => {
  it('hashes with a salt, verifies, and flags weaker params for rehash', async () => {
    const a = await hashPassword('correct horse battery', scrypt)
    const b = await hashPassword('correct horse battery', scrypt)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^scrypt\$4096\$8\$1\$/)
    expect(await verifyPassword('correct horse battery', a)).toBe(true)
    expect(await verifyPassword('wrong horse battery', a)).toBe(false)
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(needsRehash(a, { ...scrypt, N: 2 ** 13 })).toBe(true)
    expect(needsRehash(a, scrypt)).toBe(false)
  })

  it('never stores plain passwords', async () => {
    const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users')
    for (const r of rows) {
      expect(r.password_hash.startsWith('scrypt$')).toBe(true)
      for (const a of TEST_ACCOUNTS) expect(r.password_hash).not.toContain(a.password)
    }
  })
})

describe('sign-up', () => {
  it('creates a regular user, starts a session and never returns the hash', async () => {
    const c = client()
    const res = await c.call('POST', '/auth/signup', { name: 'Ana Cruz', email: '  Ana@Example.com ', password: 'a long passphrase 42' })
    expect(res.status).toBe(201)
    expect(res.json.user).toMatchObject({ email: 'ana@example.com', name: 'Ana Cruz', role: 'user' })
    expect(JSON.stringify(res.json)).not.toMatch(/password|scrypt/)
    expect(res.setCookie).toMatch(/^sid=[\w-]{43}; Path=\/; Expires=.+; HttpOnly; SameSite=Lax$/)
    expect((await c.call('GET', '/auth/me')).json.user.email).toBe('ana@example.com')
  })

  it('rejects a duplicate email in any case', async () => {
    const res = await client().call('POST', '/auth/signup', { name: 'Ana', email: 'ANA@example.com', password: 'another passphrase 1' })
    expect(res.status).toBe(409)
  })

  it('validates every field and rejects extra ones', async () => {
    const res = await client().call('POST', '/auth/signup', { name: '<script>', email: 'nope', password: 'short' })
    expect(res.status).toBe(400)
    expect(Object.keys(res.json.fields).sort()).toEqual(['email', 'name', 'password'])

    const sneaky = await client().call('POST', '/auth/signup', { name: 'Eve', email: 'eve@example.com', password: 'a long passphrase 42', role: 'admin' })
    expect(sneaky.status).toBe(400)
    const common = await client().call('POST', '/auth/signup', { name: 'Eve', email: 'eve@example.com', password: 'Password123' })
    expect(common.json.fields.password).toMatch(/too common/)
  })
})

describe('login and sessions', () => {
  it('logs in the seeded accounts with the right roles', async () => {
    const admin = await login(ADMIN.email, ADMIN.password)
    expect(admin.res.status).toBe(200)
    expect(admin.res.json.user.role).toBe('admin')
    const student = await login(STUDENT.email.toUpperCase(), STUDENT.password)
    expect(student.res.json.user.role).toBe('user')
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await login(STUDENT.email, 'not the password')
    const unknown = await login('nobody@example.com', 'not the password')
    expect(wrong.res.status).toBe(401)
    expect(unknown.res.status).toBe(401)
    expect(wrong.res.json).toEqual(unknown.res.json)
  })

  it('stores only a hash of the session token', async () => {
    const { c } = await login(STUDENT.email, STUDENT.password)
    const token = c.cookie.split('=')[1]!
    const { rows } = await db.query<{ id: string }>('SELECT id FROM sessions')
    expect(rows.some((r) => r.id === token)).toBe(false)
    expect(rows.every((r) => /^[0-9a-f]{64}$/.test(r.id))).toBe(true)
  })

  it('logs out and the old cookie stops working', async () => {
    const { c } = await login(STUDENT.email, STUDENT.password)
    const stolen = c.cookie
    expect((await c.call('POST', '/auth/logout')).status).toBe(204)
    const replay = await fetch(`${base}/auth/me`, { headers: { cookie: stolen } })
    expect(replay.status).toBe(401)
  })

  it('expires idle sessions', async () => {
    const { c } = await login(STUDENT.email, STUDENT.password)
    await db.query(`UPDATE sessions SET last_seen_at = now() - interval '25 hours'`)
    expect((await c.call('GET', '/auth/me')).status).toBe(401)
  })

  it('changes the password and signs out other devices', async () => {
    const email = 'mover@example.com'
    const phone = client()
    await phone.call('POST', '/auth/signup', { name: 'Mover', email, password: 'first passphrase 99' })
    const { c: laptop } = await login(email, 'first passphrase 99')

    const bad = await laptop.call('POST', '/auth/password', { currentPassword: 'wrong', newPassword: 'second passphrase 99' })
    expect(bad.status).toBe(400)
    const ok = await laptop.call('POST', '/auth/password', { currentPassword: 'first passphrase 99', newPassword: 'second passphrase 99' })
    expect(ok.status).toBe(204)
    expect((await laptop.call('GET', '/auth/me')).status).toBe(200)
    expect((await phone.call('GET', '/auth/me')).status).toBe(401)
    expect((await login(email, 'second passphrase 99')).res.status).toBe(200)
  })

  it('locks an account after 10 failed logins in a row', async () => {
    const email = 'locked@example.com'
    await client().call('POST', '/auth/signup', { name: 'Locked', email, password: 'real passphrase 77' })
    for (let i = 0; i < 10; i++) await login(email, `guess number ${i}`)
    const res = await login(email, 'real passphrase 77')
    expect(res.res.status).toBe(429)
  })
})

describe('role-based access', () => {
  it('blocks guests and regular users from admin routes', async () => {
    expect((await client().call('GET', '/admin/users')).status).toBe(401)
    const { c } = await login(STUDENT.email, STUDENT.password)
    expect((await c.call('GET', '/admin/users')).status).toBe(403)
    expect((await c.call('PATCH', `/admin/users/${crypto.randomUUID()}`, { role: 'admin' })).status).toBe(403)
  })

  it('lets an admin list and search users', async () => {
    const { c } = await login(ADMIN.email, ADMIN.password)
    const all = await c.call('GET', '/admin/users')
    expect(all.status).toBe(200)
    expect(all.json.total).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(all.json)).not.toMatch(/scrypt/)
    const found = await c.call('GET', '/admin/users?q=student')
    expect(found.json.users.map((u: { email: string }) => u.email)).toEqual([STUDENT.email])
  })

  it('lets an admin promote a user, which ends their sessions', async () => {
    const email = 'promote@example.com'
    const u = client()
    const signup = await u.call('POST', '/auth/signup', { name: 'Promote Me', email, password: 'brand new phrase 31' })
    const { c: admin } = await login(ADMIN.email, ADMIN.password)
    const res = await admin.call('PATCH', `/admin/users/${signup.json.user.id}`, { role: 'admin' })
    expect(res.json.user.role).toBe('admin')
    expect((await u.call('GET', '/auth/me')).status).toBe(401)
    expect((await login(email, 'brand new phrase 31')).res.json.user.role).toBe('admin')
  })

  it('disables an account so it can no longer sign in', async () => {
    const email = 'disable@example.com'
    const signup = await client().call('POST', '/auth/signup', { name: 'Disable Me', email, password: 'brand new phrase 32' })
    const { c: admin } = await login(ADMIN.email, ADMIN.password)
    await admin.call('PATCH', `/admin/users/${signup.json.user.id}`, { isActive: false })
    expect((await login(email, 'brand new phrase 32')).res.status).toBe(401)
  })

  it('stops an admin from removing their own access', async () => {
    const { c, res } = await login(ADMIN.email, ADMIN.password)
    const self = await c.call('PATCH', `/admin/users/${res.json.user.id}`, { role: 'user' })
    expect(self.status).toBe(400)
  })

  it('records security events in the audit log', async () => {
    const { c } = await login(ADMIN.email, ADMIN.password)
    const actions = (await c.call('GET', '/admin/audit')).json.events.map((e: { action: string }) => e.action)
    expect(actions).toEqual(expect.arrayContaining(['user.signup', 'login.success', 'login.failed', 'admin.user_updated']))
  })
})

describe('request hardening', () => {
  it('rejects writes from another origin', async () => {
    const res = await client().call('POST', '/auth/login', { email: ADMIN.email, password: ADMIN.password }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('rejects form posts and oversized or broken JSON', async () => {
    const form = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a&password=b',
    })
    expect(form.status).toBe(415)
    expect((await client().call('POST', '/auth/login', '{not json')).status).toBe(400)
    expect((await client().call('POST', '/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) })).status).toBe(413)
  })

  it('sends security headers and no caching', async () => {
    const res = await client().call('GET', '/health')
    expect(res.json).toEqual({ ok: true })
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-powered-by')).toBeNull()
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await client().call('GET', '/nope')
    expect(res.status).toBe(404)
    expect(res.json.error).toBe('Not found.')
  })
})

describe('config', () => {
  it('refuses unsafe production settings', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/postgres:\/\//)
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', SEED_TEST_ACCOUNTS: 'true' })).toThrow(/SEED_TEST_ACCOUNTS/)
    const prod = loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })
    expect(prod).toMatchObject({ FORCE_HTTPS: true, SEED_TEST_ACCOUNTS: false, HOST: '0.0.0.0' })
  })
})

describe('shared rate limits', () => {
  it('counts across instances, stores no plain keys, and resets', async () => {
    const a = new RateLimiter(db, 'test', 2, 60)
    const b = new RateLimiter(db, 'test', 2, 60)
    expect(await a.hit('ana@example.com')).toBe(0)
    expect(await b.hit('ana@example.com')).toBe(0)
    const wait = await a.hit('ana@example.com')
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(60)
    expect(await new RateLimiter(db, 'other', 2, 60).hit('ana@example.com')).toBe(0)
    const { rows } = await db.query('SELECT * FROM rate_limits')
    expect(JSON.stringify(rows)).not.toContain('ana@example.com')
    await a.reset('ana@example.com')
    expect(await b.hit('ana@example.com')).toBe(0)
  })

  it('starts a new window when the old one ends, and cleanup removes finished windows', async () => {
    const limiter = new RateLimiter(db, 'window', 1, 60)
    await limiter.hit('k')
    expect(await limiter.hit('k')).toBeGreaterThan(0)
    await db.query(`UPDATE rate_limits SET reset_at = now() - interval '1 second'`)
    expect(await limiter.hit('k')).toBe(0)
    await db.query(`UPDATE rate_limits SET reset_at = now() - interval '1 second'`)
    await cleanUp(db, config.SESSION_IDLE_HOURS)
    expect((await db.query('SELECT 1 FROM rate_limits')).rows).toEqual([])
  })

  it('answers 429 with Retry-After once the sign-up limit is reached', async () => {
    const app = createApp(db, config, { info: () => {}, error: () => {} }, { loginPerIp: 1000, loginPerEmail: 50, signupPerIp: 1 })
    const limited = app.listen(0)
    await new Promise((r) => limited.once('listening', r))
    const url = `http://127.0.0.1:${(limited.address() as AddressInfo).port}/api/auth/signup`
    const post = () => fetch(url, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json' }, body: '{}' })
    await db.query('DELETE FROM rate_limits')
    expect((await post()).status).toBe(400)
    const blocked = await post()
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    await new Promise((r) => limited.close(r))
  })
})

describe('transactions and migrations', () => {
  it('rolls back everything when a transaction fails', async () => {
    await expect(
      db.tx(async (t) => {
        await t.query(`INSERT INTO rate_limits VALUES ('rollback-me', 1, now())`)
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect((await db.query(`SELECT 1 FROM rate_limits WHERE key_hash = 'rollback-me'`)).rows).toEqual([])
  })

  it('applies nothing the second time', async () => {
    expect(await migrate(db)).toEqual([])
  })
})

describe('Vercel function', () => {
  const prod = { VERCEL_ENV: 'production', DATABASE_URL: 'postgres://x', VERCEL_PROJECT_PRODUCTION_URL: 'hub.example', VERCEL_URL: 'abc.vercel.app' }

  it('works out the allowed origins from the deployment', () => {
    expect(vercelConfig(prod)).toMatchObject({ APP_ORIGINS: ['https://hub.example'], TRUST_PROXY: 1, DB_POOL_MAX: 5, isProduction: true })
    expect(vercelConfig({ ...prod, VERCEL_ENV: 'preview', VERCEL_BRANCH_URL: 'b.vercel.app' }).APP_ORIGINS).toEqual([
      'https://abc.vercel.app',
      'https://b.vercel.app',
    ])
  })

  it('answers 503 without leaking details when the database is missing, and keeps retrying', async () => {
    const errors: string[] = []
    const handler = createHandler({ VERCEL_ENV: 'preview' }, { info: () => {}, error: (m) => errors.push(m) })
    const http = createServer((req, res) => void handler(req, res)).listen(0)
    await new Promise((r) => http.once('listening', r))
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/api/health`
    for (let i = 0; i < 2; i++) {
      const res = await fetch(url)
      expect(res.status).toBe(503)
      expect(await res.text()).not.toMatch(/DATABASE_URL|postgres/)
    }
    expect(errors).toHaveLength(2)
    await new Promise((r) => http.close(r))
  })
})
