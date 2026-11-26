// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { saveBody } from './dataSchema.ts'
import { connectDb, type Db } from './db.ts'
import { migrate } from './migrate.ts'
import { saveData } from './studentData.ts'

/**
 * The tests that only a real Postgres can answer: row locks between connections, lock timeouts, and
 * a connection the server ends. The rest of the suite runs on the embedded database, which has one
 * connection and so cannot race. Skipped unless TEST_DATABASE_URL points at an empty, disposable database.
 *
 * The user needs the CREATEDB privilege (the migration-race test makes a scratch database).
 *
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/college_hub_test npm run test:run -- server/postgres.test.ts
 */
const URL_ = process.env.TEST_DATABASE_URL

const ORIGIN = 'http://localhost:5173'
const PASSWORD = 'a long passphrase 42'
const config = loadConfig({ NODE_ENV: 'test', SCRYPT_N: String(2 ** 12), APP_ORIGIN: ORIGIN })
const LIMITS = { loginPerIp: 10_000, loginPerEmail: 10_000, signupPerIp: 10_000 }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!URL_)('real Postgres', () => {
  let db: Db
  let server: Server
  let base: string

  beforeAll(async () => {
    db = await connectDb(URL_!, { poolMax: 10 })
    await migrate(db)
    const log = { info: () => {}, error: () => {} }
    server = createApp(db, config, log, LIMITS, null, { savesPerMinute: 10_000, loadsPerMinute: 10_000 }).listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
  })

  afterAll(async () => {
    await new Promise((r) => server.close(r))
    await db.close()
  })

  async function call(cookie: string, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { origin: ORIGIN, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }

  let people = 0
  const run = Date.now()
  async function signUp() {
    const email = `pg-${run}-${++people}@example.com`
    const { cookie, json } = await call('', 'POST', '/auth/signup', { name: 'Test Student', email, password: PASSWORD })
    return { email, cookie, id: json.user.id as string }
  }

  /**
   * Exactly one of two racing requests succeeds. The loser is refused: 400 when it ran after the winner's
   * commit and saw the rule, or 401/403 when the winner had already ended its session.
   */
  function expectOneWinner(results: { status: number; json: unknown }[], ok: number[]) {
    const detail = JSON.stringify(results.map((r) => [r.status, r.json]))
    expect(results.filter((r) => ok.includes(r.status)), detail).toHaveLength(1)
    expect(results.filter((r) => !ok.includes(r.status)).every((r) => [400, 401, 403].includes(r.status)), detail).toBe(true)
  }

  /** Makes exactly these people the only active admins, whoever else the shared database holds. */
  async function onlyAdmins(...ids: string[]) {
    await db.query('UPDATE users SET role_id = 2 WHERE role_id = 1 AND NOT (id = ANY($1::uuid[]))', [ids])
    await db.query('UPDATE users SET role_id = 1, is_active = true WHERE id = ANY($1::uuid[])', [ids])
  }
  const activeAdmins = async () => (await db.query<{ n: number }>('SELECT count(*)::int AS n FROM users WHERE role_id = 1 AND is_active')).rows[0]!.n

  it('applies migrations once when two deploys start together', async () => {
    const admin = new URL(URL_!)
    const name = `migrate_race_${run}`
    await db.query(`CREATE DATABASE ${name}`)
    admin.pathname = `/${name}`
    const [a, b] = await Promise.all([connectDb(admin.href), connectDb(admin.href)])
    try {
      const [first, second] = await Promise.all([migrate(a), migrate(b)])
      // Each file ran exactly once between the two, and both finished.
      expect([...first, ...second].sort()).toEqual([...new Set([...first, ...second])].sort())
      expect(first.length + second.length).toBeGreaterThan(0)
      const { rows } = await a.query<{ n: number }>('SELECT count(*)::int AS n FROM schema_migrations')
      expect(rows[0]!.n).toBe(first.length + second.length)
    } finally {
      await a.close()
      await b.close()
      await db.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    }
  })

  it('never lets two admins demote each other and leave none', async () => {
    for (let round = 0; round < 8; round++) {
      const a = await signUp()
      const b = await signUp()
      await onlyAdmins(a.id, b.id)
      const [x, y] = await Promise.all([
        call(a.cookie, 'PATCH', `/admin/users/${b.id}`, { role: 'user' }),
        call(b.cookie, 'PATCH', `/admin/users/${a.id}`, { role: 'user' }),
      ])
      expectOneWinner([x, y], [200])
      expect(await activeAdmins()).toBe(1)
    }
  })

  it('never lets two admins deactivate each other, or one delete while the other leaves', async () => {
    for (let round = 0; round < 4; round++) {
      const a = await signUp()
      const b = await signUp()
      await onlyAdmins(a.id, b.id)
      const [x, y] = await Promise.all([
        call(a.cookie, 'PATCH', `/admin/users/${b.id}`, { isActive: false }),
        call(b.cookie, 'PATCH', `/admin/users/${a.id}`, { isActive: false }),
      ])
      expectOneWinner([x, y], [200])
      expect(await activeAdmins()).toBe(1)
    }
    // Both admins delete their own account at the same moment: one must be refused, and neither request may deadlock.
    for (let round = 0; round < 4; round++) {
      const a = await signUp()
      const b = await signUp()
      await onlyAdmins(a.id, b.id)
      const [x, y] = await Promise.all([
        call(a.cookie, 'POST', '/auth/delete', { password: PASSWORD }),
        call(b.cookie, 'POST', '/auth/delete', { password: PASSWORD }),
      ])
      expectOneWinner([x, y], [204])
      expect(await activeAdmins()).toBe(1)
    }
    // One admin deletes their account while the other is demoting a third: no deadlock, and someone is left.
    const a = await signUp()
    const b = await signUp()
    const c = await signUp()
    await onlyAdmins(a.id, b.id, c.id)
    const results = await Promise.all([
      call(a.cookie, 'POST', '/auth/delete', { password: PASSWORD }),
      call(b.cookie, 'PATCH', `/admin/users/${c.id}`, { role: 'user' }),
    ])
    expect(results.map((r) => r.status).every((s) => s === 200 || s === 204)).toBe(true)
    expect(await activeAdmins()).toBeGreaterThanOrEqual(1)
  })

  it('accepts exactly one of several saves that carry the same order number', async () => {
    const s = await signUp()
    const send = (title: string) =>
      call(
        s.cookie,
        'POST',
        '/data/sync',
        { accountId: s.id, clientId: 'tab-race-0001', baseRevision: 0, upsert: { tasks: [{ id: 't1', kind: 'todo', title, done: false, source: 'manual' }] } },
        { 'X-Sync-Sequence': '7' },
      )
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => send(`title ${i}`)))
    expect(results.every((r) => r.status === 200)).toBe(true)
    // Eight saves reached the database together, one of them was applied, the other seven were skipped.
    const { rows } = await db.query<{ revision: number }>('SELECT revision FROM student_profiles WHERE user_id = $1', [s.id])
    expect(rows[0]!.revision).toBe(1)
    expect((await db.query('SELECT 1 FROM sync_client_sequences WHERE user_id = $1', [s.id])).rows).toHaveLength(1)
  })

  it('answers 503 instead of waiting forever for a locked account, then recovers', async () => {
    const s = await signUp()
    const body = saveBody.parse({ accountId: s.id, clientId: 'tab-locked-01', baseRevision: 0 })
    await saveData(db, s.id, body)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let held!: () => void
    const holding = new Promise<void>((r) => (held = r))
    // Another connection holds the account's row, as a long save or a stuck deploy would.
    const holder = db.tx(async (t) => {
      await t.query('SELECT 1 FROM student_profiles WHERE user_id = $1 FOR UPDATE', [s.id])
      held()
      await gate
    })
    await holding
    try {
      const started = Date.now()
      await expect(saveData(db, s.id, body, undefined, { lock: '300ms', statement: '10s', idleInTransaction: '15s' })).rejects.toMatchObject({
        status: 503,
        retryAfter: 5,
      })
      expect(Date.now() - started).toBeLessThan(5000)
    } finally {
      // Always let go, or a failed assertion would leave the lock held and the run hanging.
      release()
      await holder
    }
    // The timeout left no half-applied state and no poisoned connection.
    await expect(saveData(db, s.id, body)).resolves.toMatchObject({ revision: 0 })
  })

  it('survives the server ending a connection mid-save, and keeps working', async () => {
    await expect(
      db.tx(async (t) => {
        await t.query(`SELECT set_config('idle_in_transaction_session_timeout', '200ms', true)`)
        await sleep(1000)
        await t.query('SELECT 1')
      }),
    ).rejects.toThrow()
    // Without a listener on the connection this would have crashed the process. The pool still serves queries.
    expect((await db.query<{ ok: number }>('SELECT 1 AS ok')).rows[0]!.ok).toBe(1)
    await db.tx((t) => t.query('SELECT 1'))
  })

  it('does not leave the save timeouts on the connection for the next user', async () => {
    const s = await signUp()
    const body = saveBody.parse({ accountId: s.id, clientId: 'tab-timeout-02', baseRevision: 0 })
    await saveData(db, s.id, body, undefined, { lock: '1234ms', statement: '12s', idleInTransaction: '13s' })
    const seen = await Promise.all(Array.from({ length: 10 }, () => db.query<{ s: string }>(`SELECT current_setting('lock_timeout') AS s`)))
    expect(seen.every((r) => r.rows[0]!.s !== '1234ms')).toBe(true)
  })
})
