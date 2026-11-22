// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { connectDb, type Db } from './db.ts'
import { googleVerifier } from './google.ts'
import { migrate } from './migrate.ts'
import { hashPassword } from './password.ts'
import { insertUser } from './users.ts'

const ORIGIN = 'http://localhost:5173'
const CLIENT = 'abc.apps.googleusercontent.com'
const config = loadConfig({ NODE_ENV: 'test', SCRYPT_N: String(2 ** 12), APP_ORIGIN: ORIGIN })
const scrypt = { N: config.SCRYPT_N, r: 8, p: 1 }
const quiet = { info: () => {}, error: () => {} }
const LIMITS = { loginPerIp: 1000, loginPerEmail: 50, signupPerIp: 1000 }

let db: Db
let server: Server
let base: string
let keys: JWTVerifyGetKey
let sign: (claims: Record<string, unknown>, opts?: { aud?: string; iss?: string; exp?: string }) => Promise<string>
let forge: typeof sign

beforeAll(async () => {
  const real = await generateKeyPair('RS256')
  const fake = await generateKeyPair('RS256')
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(real.publicKey)), kid: 'k1', alg: 'RS256' }] })
  const signer =
    (key: Parameters<SignJWT['sign']>[0]): typeof sign =>
    (claims, { aud = CLIENT, iss = 'https://accounts.google.com', exp = '1h' } = {}) =>
      new SignJWT({ email_verified: true, name: 'Juan Dela Cruz', ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuedAt()
        .setAudience(aud)
        .setIssuer(iss)
        .setExpirationTime(exp)
        .sign(key)
  sign = signer(real.privateKey)
  forge = signer(fake.privateKey)

  db = await connectDb('memory://')
  await migrate(db)
  server = createApp(db, config, quiet, LIMITS, googleVerifier(CLIENT, keys)).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

afterAll(async () => {
  await new Promise((r) => server.close(r))
  await db.close()
})

function client(url = base) {
  let cookie = ''
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(url + path, {
      method,
      headers: { origin: ORIGIN, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]!
    const text = await res.text()
    return { status: res.status, json: text ? JSON.parse(text) : null }
  }
}

const passwordUser = async (email: string, password: string, role: 'user' | 'admin' = 'user') =>
  (await insertUser(db, { email, name: 'Someone', role, passwordHash: await hashPassword(password, scrypt) }))!

describe('token checks', () => {
  const verify = (t: string) => googleVerifier(CLIENT, keys)(t)

  it('reads the profile from a valid token', async () => {
    const picture = 'https://lh3.googleusercontent.com/a/photo'
    expect(await verify(await sign({ sub: '1', email: 'Juan@DLSU.edu.ph', hd: 'dlsu.edu.ph', name: 'Niño Peña', picture }))).toEqual({
      sub: '1',
      email: 'juan@dlsu.edu.ph',
      name: 'Niño Peña',
      picture,
      authoritative: true,
    })
  })

  it('rejects a bad signature, another app, another issuer, expired, unsigned and malformed tokens', async () => {
    const claims = { sub: '1', email: 'juan@gmail.com' }
    expect(await verify(await forge(claims))).toBeNull()
    expect(await verify(await sign(claims, { aud: 'other' }))).toBeNull()
    expect(await verify(await sign(claims, { iss: 'https://evil.example' }))).toBeNull()
    expect(await verify(await sign(claims, { exp: '-1h' }))).toBeNull()
    const [, payload] = (await sign(claims)).split('.')
    expect(await verify(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.`)).toBeNull()
    expect(await verify('not-a-jwt')).toBeNull()
  })

  it('rejects an unverified email and drops unsafe names and pictures', async () => {
    expect(await verify(await sign({ sub: '1', email: 'a@gmail.com', email_verified: false }))).toBeNull()
    const p = await verify(await sign({ sub: '1', email: 'juan@gmail.com', name: '<b>\u0000', picture: 'https://evil.example/x.png' }))
    expect(p).toMatchObject({ name: 'b', picture: null })
    const long = await verify(await sign({ sub: '1', email: 'juan@gmail.com', name: 'x'.repeat(200) }))
    expect(long!.name).toHaveLength(60)
  })

  it('says it could not check when Google is unreachable, instead of blaming the token', async () => {
    const down = googleVerifier(CLIENT, () => Promise.reject(new TypeError('fetch failed')))
    await expect(down(await sign({ sub: '1', email: 'juan@gmail.com' }))).rejects.toMatchObject({ status: 503 })
  })
})

describe('signing in with Google', () => {
  it('creates an account the first time and finds it the next time, even if the email changes', async () => {
    const c = client()
    const first = await c('POST', '/auth/google', { credential: await sign({ sub: 'new-1', email: 'new@gmail.com' }) })
    expect(first.status).toBe(201)
    expect(first.json.user).toMatchObject({ email: 'new@gmail.com', role: 'user', hasPassword: false, hasGoogle: true })
    expect((await c('GET', '/auth/me')).json.user.id).toBe(first.json.user.id)
    const again = await client()('POST', '/auth/google', { credential: await sign({ sub: 'new-1', email: 'renamed@gmail.com' }) })
    expect(again.status).toBe(200)
    expect(again.json.user.id).toBe(first.json.user.id)
  })

  it('refuses a forged token and starts no session', async () => {
    const c = client()
    expect((await c('POST', '/auth/google', { credential: await forge({ sub: 'x', email: 'x@gmail.com' }) })).status).toBe(401)
    expect((await c('GET', '/auth/me')).status).toBe(401)
  })

  it('handles two first sign-ins at once', async () => {
    const credential = await sign({ sub: 'race', email: 'race@gmail.com' })
    const results = await Promise.all([client()('POST', '/auth/google', { credential }), client()('POST', '/auth/google', { credential })])
    expect(results.map((r) => r.status).sort()).toEqual([200, 201])
    expect(results[0]!.json.user.id).toBe(results[1]!.json.user.id)
  })

  it('takes an unverified account back from whoever registered the email first', async () => {
    const user = await passwordUser('victim@gmail.com', 'squatter phrase 11')
    const squatter = client()
    expect((await squatter('POST', '/auth/login', { email: 'victim@gmail.com', password: 'squatter phrase 11' })).status).toBe(200)

    const owner = await client()('POST', '/auth/google', { credential: await sign({ sub: 'victim', email: 'victim@gmail.com' }) })
    expect(owner.json).toMatchObject({ passwordRemoved: true, user: { id: user.id, hasPassword: false } })
    expect((await squatter('GET', '/auth/me')).status).toBe(401)
    expect((await squatter('POST', '/auth/login', { email: 'victim@gmail.com', password: 'squatter phrase 11' })).status).toBe(401)
  })

  it('keeps the password when the email was already verified', async () => {
    const user = await passwordUser('verified@gmail.com', 'verified phrase 11')
    await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [user.id])
    const res = await client()('POST', '/auth/google', { credential: await sign({ sub: 'verified', email: 'verified@gmail.com' }) })
    expect(res.json).toMatchObject({ passwordRemoved: false, user: { hasPassword: true, hasGoogle: true } })
  })

  it('does not link an address Google does not run, or one that now belongs to another Google account', async () => {
    await passwordUser('me@custom.example', 'custom phrase 1111')
    const custom = await client()('POST', '/auth/google', { credential: await sign({ sub: 'custom', email: 'me@custom.example' }) })
    expect(custom.status).toBe(409)
    const other = await client()('POST', '/auth/google', { credential: await sign({ sub: 'somebody-else', email: 'race@gmail.com' }) })
    expect(other.status).toBe(409)
  })

  it('refuses a disabled account', async () => {
    const credential = await sign({ sub: 'off', email: 'off@gmail.com' })
    const { json } = await client()('POST', '/auth/google', { credential })
    await db.query('UPDATE users SET is_active = false WHERE id = $1', [json.user.id])
    expect((await client()('POST', '/auth/google', { credential })).status).toBe(403)
  })

  it('never lets a Google-only account in with a password', async () => {
    for (const password of ['null', 'undefined', 'a long passphrase 42']) {
      expect((await client()('POST', '/auth/login', { email: 'new@gmail.com', password })).status).toBe(401)
    }
    const c = client()
    await c('POST', '/auth/google', { credential: await sign({ sub: 'new-1', email: 'new@gmail.com' }) })
    const change = await c('POST', '/auth/password', { currentPassword: 'anything', newPassword: 'a long passphrase 42' })
    expect(change.status).toBe(400)
  })
})

describe('server options', () => {
  it('says which sign-in methods are on', async () => {
    expect((await client()('GET', '/auth/options')).json).toEqual({ emailSignup: true, google: true })
  })

  it('turns email sign-up off in production unless asked, and reuses the browser client id', () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://x', VITE_GOOGLE_CLIENT_ID: CLIENT }
    expect(loadConfig(env)).toMatchObject({ EMAIL_SIGNUP: false, GOOGLE_CLIENT_ID: CLIENT })
    expect(loadConfig({ ...env, EMAIL_SIGNUP: 'true' }).EMAIL_SIGNUP).toBe(true)
  })

  it('blocks email sign-up and Google when they are off', async () => {
    const app = createApp(db, { ...config, EMAIL_SIGNUP: false }, quiet, LIMITS, null).listen(0)
    await new Promise((r) => app.once('listening', r))
    const c = client(`http://127.0.0.1:${(app.address() as AddressInfo).port}/api`)
    expect((await c('GET', '/auth/options')).json).toEqual({ emailSignup: false, google: false })
    expect((await c('POST', '/auth/signup', { name: 'Eve', email: 'eve@example.com', password: 'a long passphrase 42' })).status).toBe(403)
    expect((await c('POST', '/auth/google', { credential: 'x'.repeat(30) })).status).toBe(503)
    await new Promise((r) => app.close(r))
  })
})

describe('deleting an account', () => {
  it('needs the right password, then removes the user and their sessions', async () => {
    const user = await passwordUser('leaver@example.com', 'leaver phrase 1111')
    const c = client()
    await c('POST', '/auth/login', { email: user.email, password: 'leaver phrase 1111' })
    expect((await c('POST', '/auth/delete', { password: 'wrong' })).status).toBe(400)
    expect((await c('POST', '/auth/delete', { email: user.email })).status).toBe(400)
    expect((await c('POST', '/auth/delete', { password: 'leaver phrase 1111' })).status).toBe(204)
    expect((await c('GET', '/auth/me')).status).toBe(401)
    expect((await db.query('SELECT 1 FROM users WHERE id = $1', [user.id])).rows).toEqual([])
    expect((await db.query('SELECT 1 FROM sessions WHERE user_id = $1', [user.id])).rows).toEqual([])
    const { rows } = await db.query('SELECT actor_id, target_id, ip FROM audit_log ORDER BY id DESC LIMIT 1')
    expect(rows[0]).toEqual({ actor_id: null, target_id: null, ip: null })
  })

  it('asks Google-only accounts to type their email, and lets them start over', async () => {
    const credential = await sign({ sub: 'gone', email: 'gone@gmail.com' })
    const c = client()
    const { json } = await c('POST', '/auth/google', { credential })
    expect((await c('POST', '/auth/delete', { email: 'other@gmail.com' })).status).toBe(400)
    expect((await c('POST', '/auth/delete', { email: 'gone@gmail.com' })).status).toBe(204)
    const fresh = await client()('POST', '/auth/google', { credential })
    expect(fresh.status).toBe(201)
    expect(fresh.json.user.id).not.toBe(json.user.id)
  })

  it('keeps the only admin, and needs a session', async () => {
    expect((await client()('POST', '/auth/delete', { password: 'x' })).status).toBe(401)
    const admin = await passwordUser('boss@example.com', 'boss phrase 111111', 'admin')
    const c = client()
    await c('POST', '/auth/login', { email: admin.email, password: 'boss phrase 111111' })
    const res = await c('POST', '/auth/delete', { password: 'boss phrase 111111' })
    expect(res.status).toBe(400)
    expect(res.json.error).toMatch(/only admin/)
  })
})
