// @vitest-environment node
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { QUOTAS, saveBody } from './dataSchema.ts'
import { connectDb, type Db } from './db.ts'
import { migrate } from './migrate.ts'
import { saveData, type SaveResult, type StudentData } from './studentData.ts'

const ORIGIN = 'http://localhost:5173'
const PASSWORD = 'a long passphrase 42'
const config = loadConfig({ NODE_ENV: 'test', SCRYPT_N: String(2 ** 12), APP_ORIGIN: ORIGIN })
const LIMITS = { loginPerIp: 1000, loginPerEmail: 50, signupPerIp: 1000 }

let db: Db
let server: Server
let base: string
const logged: unknown[] = []

beforeAll(async () => {
  db = await connectDb('memory://')
  await migrate(db)
  const log = { info: () => {}, error: (m: string, e?: unknown) => logged.push(m, e) }
  server = createApp(db, config, log, LIMITS, null, { savesPerMinute: 60, loadsPerMinute: 60 }).listen(0)
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
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null, cookie: res.headers.get('set-cookie')?.split(';')[0] ?? '' }
}

let people = 0
/** A new student, signed in. */
async function student() {
  const email = `student${++people}@example.com`
  const { cookie, json } = await call('', 'POST', '/auth/signup', { name: 'Test Student', email, password: PASSWORD })
  const accountId = json.user.id as string
  const load = async () => (await call(cookie, 'GET', '/data')).json.data as StudentData
  /** A browser tab that remembers the revision it is on. */
  const tab = (clientId: string) => {
    const state = { revision: 0 }
    const send = (body: object, baseRevision = state.revision) => call(cookie, 'POST', '/data/sync', { accountId, clientId, baseRevision, ...body })
    const save = async (body: object) => {
      const res = await send(body)
      expect(res.status, JSON.stringify(res.json)).toBe(200)
      state.revision = res.json.revision
      return res.json as SaveResult
    }
    return { state, send, save }
  }
  return { email, cookie, accountId, load, tab, ...tab('tab-main-1') }
}

const AT = '2026-11-22T03:00:00.000Z'
const course = (id: string, extra = {}) => ({ id, code: 'CS 101', name: 'Data Structures', units: 3, color: '#4fd1c5', ...extra })
const session = (id: string, courseId: string, extra = {}) => ({ id, courseId, days: [1, 4], start: '09:15', end: '10:45', room: 'UH 310', ...extra })
const task = (id: string, extra = {}) => ({ id, kind: 'assignment', title: 'Essay', done: false, source: 'manual', ...extra })
const note = (id: string, extra = {}) => ({ id, title: 'Limits', body: '# Hi', createdAt: AT, updatedAt: AT, ...extra })
const component = (id: string, courseId: string, extra = {}) => ({ id, courseId, name: 'Exam', weight: 30, score: null, ...extra })

const full = {
  upsert: {
    courses: [course('c1', { professor: 'Prof. Reyes', professorEmail: 'reyes@example.com', officeHours: 'Tue 2 PM', override: 3.5, target: 4 }), course('c2', { code: 'MATH 1' })],
    sessions: [session('s1', 'c1', { building: 'Gokongwei' })],
    tasks: [task('t1', { courseId: 'c1', due: '2026-12-01T23:59', weight: 12.5 }), task('t2', { kind: 'todo', done: true, source: 'ics', externalId: 'uid-9', due: '2026-12-02' })],
    notes: [note('n1', { courseId: 'c1', sessionId: 's1', sessionDate: '2026-11-19' })],
    components: [component('g1', 'c1', { score: 88.25 }), component('g2', 'c1')],
  },
  profile: { name: 'Juan', isDemo: false, bannerDismissed: true, taskMode: 'flow', scale: [{ grade: 4, min: 95 }], prior: { cgpa: 3.4, units: 36 } },
}

describe('loading and saving', () => {
  it('starts empty', async () => {
    const s = await student()
    expect(await s.load()).toEqual({
      revision: 0,
      profile: { name: '', isDemo: false, bannerDismissed: false, taskMode: null, scale: null, prior: { cgpa: null, units: null } },
      courses: [], sessions: [], tasks: [], notes: [], components: [],
    })
  })

  it('gives back exactly what was saved, in order', async () => {
    const s = await student()
    expect(await s.save(full)).toEqual({ revision: 1, data: null, noteCopies: {} })
    expect(await s.load()).toEqual({ revision: 1, profile: full.profile, ...full.upsert })
  })

  it('updates and removes single records, and leaves the rest', async () => {
    const s = await student()
    await s.save(full)
    await s.save({ upsert: { tasks: [task('t1', { done: true })] }, remove: { components: ['g2'] }, profile: { name: 'J' } })
    const data = await s.load()
    expect(data.tasks).toEqual([task('t1', { done: true }), full.upsert.tasks[1]])
    expect(data.components).toEqual([full.upsert.components[0]])
    expect(data.profile).toEqual({ ...full.profile, name: 'J' })
    expect(data.courses).toEqual(full.upsert.courses)
  })

  it('can clear optional values and the grading scale', async () => {
    const s = await student()
    await s.save(full)
    await s.save({ upsert: { courses: [course('c1')] }, profile: { scale: null, prior: { cgpa: null, units: null } } })
    const data = await s.load()
    expect(data.courses[0]).toEqual(course('c1'))
    expect(data.profile.scale).toBeNull()
    expect(data.profile.prior).toEqual({ cgpa: null, units: null })
  })

  it('does not bump the revision for an empty save', async () => {
    const s = await student()
    await s.save(full)
    expect(await s.save({})).toEqual({ revision: 1, data: null, noteCopies: {} })
  })

  it('answers ?since with nothing when nothing changed', async () => {
    const s = await student()
    await s.save(full)
    expect((await call(s.cookie, 'GET', '/data?since=1')).json).toEqual({ accountId: s.accountId, revision: 1, data: null, features: ['taskMode', 'progress', 'estimate'] })
    expect((await call(s.cookie, 'GET', '/data?since=0')).json.data.courses).toHaveLength(2)
    expect((await call(s.cookie, 'GET', '/data?since=abc')).status).toBe(400)
  })

  it('stores pasted control characters and half emojis without failing', async () => {
    const s = await student()
    await s.save({ upsert: { notes: [note('n1', { title: 'a\0b', body: `cut \ud83d and whole 😀 'quote" \\ \n;DROP TABLE notes` })] } })
    expect((await s.load()).notes[0]).toMatchObject({ title: 'ab', body: `cut � and whole 😀 'quote" \\ \n;DROP TABLE notes` })
  })

  it('accepts half-typed numbers the forms allow', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1', { units: 400 })], components: [component('g1', 'c1', { weight: -5, score: 1000 })] } })
    expect((await s.load()).components[0]).toMatchObject({ weight: -5, score: 1000 })
  })

  it('keeps the last of two records with the same id, and upsert beats remove', async () => {
    const s = await student()
    await s.save({ upsert: { tasks: [task('t1', { title: 'one' }), task('t1', { title: 'two' })] }, remove: { tasks: ['t1'] } })
    expect((await s.load()).tasks).toEqual([task('t1', { title: 'two' })])
  })
})

describe('each student only reaches their own data', () => {
  it('refuses people who are not signed in', async () => {
    expect((await call('', 'GET', '/data')).status).toBe(401)
    expect((await call('', 'POST', '/data/sync', {})).status).toBe(401)
    // Even with a huge body, which is never read.
    expect((await call('', 'POST', '/data/sync', JSON.stringify({ x: 'x'.repeat(100_000) }))).status).toBe(401)
  })

  it('keeps students apart even when they use the same ids', async () => {
    const a = await student()
    const b = await student()
    await a.save(full)
    await b.save({ upsert: { courses: [course('c1', { code: 'MINE' })], notes: [note('n1', { body: 'b only' })] } })
    expect(await a.load()).toEqual({ revision: 1, profile: full.profile, ...full.upsert })
    const mine = await b.load()
    expect(mine.courses).toEqual([course('c1', { code: 'MINE' })])
    expect(mine.notes).toEqual([note('n1', { body: 'b only' })])
    expect(mine.tasks).toEqual([])
  })

  it('cannot remove or edit another student\'s records', async () => {
    const a = await student()
    const b = await student()
    await a.save(full)
    await b.save({ remove: { courses: ['c1', 'c2'], sessions: ['s1'], tasks: ['t1'], notes: ['n1'], components: ['g1'] } })
    // Links-only edit of a note id that exists only for A.
    const res = await b.save({ upsert: { notes: [{ id: 'n1', createdAt: AT, updatedAt: AT }] } })
    expect(res.data?.notes).toEqual([])
    expect(await a.load()).toEqual({ revision: 1, profile: full.profile, ...full.upsert })
  })

  it('cannot attach records to another student\'s course', async () => {
    const a = await student()
    const b = await student()
    await a.save(full)
    const res = await b.save({
      upsert: { sessions: [session('s9', 'c1')], components: [component('g9', 'c1')], tasks: [task('t9', { courseId: 'c1' })], notes: [note('n9', { courseId: 'c1', sessionId: 's1' })] },
    })
    expect(res.data).toMatchObject({ sessions: [], components: [], tasks: [task('t9')], notes: [note('n9')] })
  })

  it('has no way to name another user', async () => {
    const a = await student()
    const b = await student()
    await a.save(full)
    const { rows } = await db.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [a.email])
    expect((await b.send({ userId: rows[0]!.id, user_id: rows[0]!.id })).status).toBe(400)
    await b.save({ upsert: { tasks: [{ ...task('t1'), userId: rows[0]!.id, user_id: rows[0]!.id }] } })
    expect((await call(b.cookie, 'GET', `/data?userId=${rows[0]!.id}`)).json.data.courses).toEqual([])
    expect((await a.load()).revision).toBe(1)
  })

  it('refuses a save from a tab that still shows another account', async () => {
    const a = await student()
    const b = await student()
    await a.save(full)
    // B signed in in another tab, so A's tab now sends B's cookie.
    const res = await call(b.cookie, 'POST', '/data/sync', { accountId: a.accountId, clientId: 'tab-main-1', baseRevision: 1, upsert: { tasks: [task('t9')] } })
    expect(res.status).toBe(409)
    expect((await b.load()).tasks).toEqual([])
    expect((await a.load()).tasks).toEqual(full.upsert.tasks)
    // And B cannot save as A by naming A.
    expect((await b.send({ accountId: a.accountId, remove: { courses: ['c1'] } })).status).toBe(409)
    expect((await a.load()).courses).toEqual(full.upsert.courses)
  })

  it('refuses saves from another site', async () => {
    const s = await student()
    const res = await call(s.cookie, 'POST', '/data/sync', { clientId: 'tab-main-1', baseRevision: 0 }, { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
  })

  it('stops working after sign-out', async () => {
    const s = await student()
    await call(s.cookie, 'POST', '/auth/logout')
    expect((await call(s.cookie, 'GET', '/data')).status).toBe(401)
    expect((await s.send({})).status).toBe(401)
  })

  it('asks to sign in when the account disappears during a save', async () => {
    const body = saveBody.parse({ accountId: '00000000-0000-4000-8000-000000000000', clientId: 'tab-main-1', baseRevision: 0, upsert: { tasks: [task('t1')] } })
    await expect(saveData(db, '00000000-0000-4000-8000-000000000000', body)).rejects.toMatchObject({ status: 401 })
  })

  it('deletes everything with the account', async () => {
    const s = await student()
    await s.save(full)
    const count = async () => {
      const { rows } = await db.query<{ n: number }>(
        `SELECT ((SELECT count(*) FROM courses) + (SELECT count(*) FROM class_sessions) + (SELECT count(*) FROM tasks)
               + (SELECT count(*) FROM notes) + (SELECT count(*) FROM grade_components) + (SELECT count(*) FROM student_profiles))::int AS n`,
      )
      return rows[0]!.n
    }
    const before = await count()
    expect((await call(s.cookie, 'POST', '/auth/delete', { password: PASSWORD })).status).toBe(204)
    expect(await count()).toBe(before - 9)
  })
})

describe('links between records', () => {
  it('removes a course with its classes and components, and keeps its tasks and notes', async () => {
    const s = await student()
    await s.save(full)
    await s.save({ remove: { courses: ['c1'] } })
    const data = await s.load()
    expect(data).toMatchObject({ courses: [{ id: 'c2' }], sessions: [], components: [] })
    expect(data.tasks[0]).toEqual(task('t1', { due: '2026-12-01T23:59', weight: 12.5 }))
    expect(data.notes).toEqual([note('n1')])
  })

  it('drops or unlinks records whose course is gone, and says so', async () => {
    const s = await student()
    const res = await s.save({ upsert: { sessions: [session('s1', 'gone')], components: [component('g1', 'gone')], tasks: [task('t1', { courseId: 'gone' })], notes: [note('n1', { sessionId: 'gone', sessionDate: '2026-11-19' })] } })
    expect(res.data).toMatchObject({ sessions: [], components: [], tasks: [task('t1')], notes: [note('n1')] })
  })

  it('accepts a course and everything in it in one save', async () => {
    const s = await student()
    await s.save(full)
    await s.save({ remove: { courses: ['c1'] }, upsert: { courses: [course('c3')], sessions: [session('s3', 'c3')], tasks: [task('t1', { courseId: 'c3' })] } })
    expect((await s.load()).sessions).toEqual([session('s3', 'c3')])
  })

  it('never imports the same calendar item twice', async () => {
    const s = await student()
    const ics = (id: string, externalId: string, extra = {}) => task(id, { source: 'ics', externalId, ...extra })
    await s.save({ upsert: { tasks: [ics('t1', 'uid-1')] } })
    const res = await s.save({ upsert: { tasks: [ics('t2', 'uid-1'), ics('t3', 'uid-2'), ics('t4', 'uid-2'), ics('t1', 'uid-1', { done: true })] } })
    expect(res.data?.tasks.map((t) => [t.id, t.done])).toEqual([['t1', true], ['t3', false]])
    // Another student can have the same calendar.
    const other = await student()
    await other.save({ upsert: { tasks: [ics('mine', 'uid-1')] } })
    expect((await other.load()).tasks).toHaveLength(1)
  })
})

describe('two devices', () => {
  it('rejects the effect of delayed and duplicate saves from the original writer before any data is mutated', async () => {
    const s = await student()
    const send = (sequence: number, changes: object) => call(s.cookie, 'POST', '/data/sync', {
      accountId: s.accountId, clientId: 'tab-origin', baseRevision: 0, ...changes,
    }, { 'X-Sync-Sequence': String(sequence) })
    const latest = task('t1', { title: 'Latest edit' })
    expect((await send(2, { upsert: { tasks: [latest] } })).status).toBe(200)
    for (const sequence of [1, 2]) {
      const late = await send(sequence, { remove: { tasks: ['t1'] }, profile: { name: 'Old name' } })
      expect(late.status).toBe(200)
      expect(late.json).toMatchObject({ revision: 1, data: { tasks: [latest] } })
    }
    const saved = await s.load()
    expect(saved.tasks).toEqual([latest])
    expect(saved.profile.name).not.toBe('Old name')
  })

  it('refuses a malformed sync sequence, and accepts saves without one', async () => {
    const s = await student()
    const send = (sequence: string | undefined, id: string) => call(s.cookie, 'POST', '/data/sync', {
      accountId: s.accountId, clientId: 'tab-alpha-1', baseRevision: 0, upsert: { tasks: [task(id)] },
    }, sequence === undefined ? {} : { 'X-Sync-Sequence': sequence })
    for (const bad of ['0', '-1', '1.5', '1e3', '+5', 'abc', '', '9'.repeat(16)]) expect((await send(bad, 'x')).status).toBe(400)
    expect((await s.load()).tasks).toEqual([])
    const ok = await send(undefined, 't1'); expect(ok.status, JSON.stringify(ok.json)).toBe(200)
    expect((await s.load()).tasks).toHaveLength(1)
  })

  it('does not use up a sequence when the save is rolled back, and keeps clients apart', async () => {
    const s = await student()
    await s.save({ upsert: { courses: Array.from({ length: QUOTAS.courses }, (_, i) => course(`c${i}`)) } })
    const send = (clientId: string, sequence: number, changes: object) => call(s.cookie, 'POST', '/data/sync', {
      accountId: s.accountId, clientId, baseRevision: 1, ...changes,
    }, { 'X-Sync-Sequence': String(sequence) })
    expect((await send('tab-alpha-1', 5, { upsert: { courses: [course('one-more')] } })).status).toBe(422)
    // The refused save left no sequence behind, so the same number is still accepted.
    expect((await send('tab-alpha-1', 5, { upsert: { tasks: [task('t1')] } })).status).toBe(200)
    // Another tab starts at 1 and is not held back by tab-a's numbers.
    expect((await send('tab-beta-1', 1, { upsert: { tasks: [task('t2')] } })).status).toBe(200)
    expect((await s.load()).tasks.map((t) => (t as { id: string }).id).sort()).toEqual(['t1', 't2'])
  })

  it('sends back everything when another device saved first, and merges both', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { tasks: [task('t1')] } })
    const res = await phone.save({ upsert: { tasks: [task('t2')] } })
    expect(res.revision).toBe(2)
    expect(res.data?.tasks.map((t) => t.id)).toEqual(['t1', 't2'])
  })

  it('lets the last save of a task win', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { tasks: [task('t1')] } })
    await phone.save({ upsert: { tasks: [task('t1', { title: 'From the phone' })] } })
    expect((await s.load()).tasks).toEqual([task('t1', { title: 'From the phone' })])
  })

  it('keeps both versions when a note was edited on two devices', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { notes: [note('n1')] } })
    await phone.save({})
    await s.save({ upsert: { notes: [note('n1', { body: 'laptop' })] } })
    const stale = phone.state.revision
    const body = { upsert: { notes: [note('n1', { body: 'phone' })] } }
    const res = await phone.save(body)
    const copyId = res.noteCopies.n1!
    expect(res.data?.notes).toEqual([note('n1', { body: 'laptop' }), note(copyId, { title: 'Limits (copy)', body: 'phone' })])

    // The answer got lost and the phone tries again with more typed: still one copy.
    const again = await phone.send({ upsert: { notes: [note('n1', { body: 'phone, more' })] } }, stale)
    expect(again.json.noteCopies).toEqual({ n1: copyId })
    expect((await s.load()).notes.map((n) => n.body)).toEqual(['laptop', 'phone, more'])
  })

  it('does not call our own retry a conflict', async () => {
    const s = await student()
    await s.save({ upsert: { notes: [note('n1')] } })
    const res = await s.send({ upsert: { notes: [note('n1', { body: 'more' })] } }, 0)
    expect(res.json.noteCopies).toEqual({})
    expect((await s.load()).notes).toEqual([note('n1', { body: 'more' })])
  })

  it('does not copy a note when only its links changed, or when both typed the same', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { courses: [course('c1')], notes: [note('n1')] } })
    await phone.save({})
    await s.save({ upsert: { notes: [note('n1', { body: 'laptop' })] } })
    const links = await phone.save({ upsert: { notes: [{ id: 'n1', courseId: 'c1', createdAt: AT, updatedAt: AT }] } })
    expect(links.noteCopies).toEqual({})
    expect(links.data?.notes).toEqual([note('n1', { body: 'laptop', courseId: 'c1' })])
    const same = await phone.send({ upsert: { notes: [note('n1', { body: 'laptop' })] } }, 1)
    expect(same.json.noteCopies).toEqual({})
  })

  it('still notices a conflict after a links-only save in between', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { notes: [note('n1')] } })
    await phone.save({})
    await s.save({ upsert: { notes: [note('n1', { body: 'laptop' })] } })
    await phone.send({ upsert: { notes: [{ id: 'n1', createdAt: AT, updatedAt: AT }] } })
    const res = await phone.send({ upsert: { notes: [note('n1', { body: 'phone' })] } })
    expect(Object.keys(res.json.noteCopies)).toEqual(['n1'])
  })

  it('does not delete a note that the other device just edited', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { notes: [note('n1')] } })
    await phone.save({})
    await s.save({ upsert: { notes: [note('n1', { body: 'important' })] } })
    const res = await phone.save({ remove: { notes: ['n1'] } })
    expect(res.data?.notes).toEqual([note('n1', { body: 'important' })])
  })

  it('brings back a note that was deleted on one device while being edited on the other', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    await s.save({ upsert: { notes: [note('n1')] } })
    await phone.save({})
    await s.save({ remove: { notes: ['n1'] } })
    await phone.save({ upsert: { notes: [note('n1', { body: 'still writing' })] } })
    expect((await s.load()).notes).toEqual([note('n1', { body: 'still writing' })])
  })

  it('cuts a long title without splitting an emoji', async () => {
    const s = await student()
    const phone = s.tab('tab-phone-1')
    const title = 'x' + '😀'.repeat(149)
    await s.save({ upsert: { notes: [note('n1', { title, body: 'a' })] } })
    const res = await phone.save({ upsert: { notes: [note('n1', { title, body: 'b' })] } })
    expect(res.data?.notes[1]?.title).toMatch(/^x(😀)+ \(copy\)$/u)
  })

  it('survives many saves at once', async () => {
    const s = await student()
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => s.tab(`tab-number-${i}`).send({ upsert: { tasks: [task(`t${i}`)] } })))
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(200))
    expect(new Set(results.map((r) => r.json.revision)).size).toBe(10)
    expect((await s.load()).tasks).toHaveLength(10)
  })
})

describe('limits', () => {
  it('saves nothing when any part is invalid', async () => {
    const s = await student()
    await s.save(full)
    const bad: object[] = [
      { tasks: [task('t5'), task('t6', { kind: 'nope' })] },
      { tasks: [task('bad id!')] },
      { courses: [course('c9', { color: 'url(https://evil.example)' })] },
      { courses: [course('c9', { units: 'three' })] },
      { sessions: [session('s9', 'c1', { days: [7] })] },
      { sessions: [session('s9', 'c1', { start: '9am' })] },
      { tasks: [task('t9', { due: 'tomorrow' })] },
      { notes: [note('n9', { createdAt: 'yesterday' })] },
      { notes: [note('n9', { body: undefined })] },
      { notes: [note('n9', { body: 'x'.repeat(100_001) })] },
      { secrets: [] },
    ]
    for (const upsert of bad) {
      const res = await s.send({ upsert })
      expect(res.status, JSON.stringify(upsert).slice(0, 100)).toBe(400)
    }
    expect((await s.send({ profile: { role: 'admin' } })).status).toBe(400)
    expect((await call(s.cookie, 'POST', '/data/sync', { upsert: {} })).status).toBe(400)
    expect((await call(s.cookie, 'POST', '/data/sync', '{"a":')).status).toBe(400)
    expect(await s.load()).toEqual({ revision: 1, profile: full.profile, ...full.upsert })
  })

  it('stops at the number of records, and rolls the whole save back', async () => {
    const s = await student()
    await s.save({ upsert: { courses: Array.from({ length: QUOTAS.courses }, (_, i) => course(`c${i}`)) } })
    const res = await s.send({ upsert: { courses: [course('one-more')], tasks: [task('t1')] } })
    expect(res.status).toBe(422)
    expect(res.json.error).toContain('200 courses')
    const data = await s.load()
    expect(data.revision).toBe(1)
    expect(data.courses).toHaveLength(QUOTAS.courses)
    expect(data.tasks).toEqual([])
    // Editing and deleting still work at the limit.
    await s.save({ upsert: { courses: [course('c0', { code: 'NEW' })] }, remove: { courses: ['c1'] } })
  })

  it('stops at the total size, below what Vercel can answer with', async () => {
    const s = await student()
    // Quotes take two bytes each in JSON.
    const big = (from: number, n: number) => Array.from({ length: n }, (_, i) => note(`n${from + i}`, { body: '"'.repeat(100_000) }))
    await s.save({ upsert: { notes: big(0, 14) } })
    const res = await s.send({ upsert: { notes: big(14, 2) } })
    expect(res.status).toBe(422)
    expect(res.json.error).toContain('full')
    const size = Buffer.byteLength(JSON.stringify((await call(s.cookie, 'GET', '/data')).json))
    expect(size).toBeLessThan(QUOTAS.bytes + 100_000)
    await s.save({ remove: { notes: ['n0'] } })
  })

  it('takes a full account in one save, but not more than 4 MB', async () => {
    const s = await student()
    const tasks = Array.from({ length: QUOTAS.tasks }, (_, i) => task(`t_${i}`, { title: `Task number ${i}` }))
    const start = performance.now()
    await s.save({ upsert: { tasks } })
    expect(performance.now() - start).toBeLessThan(5000)
    expect((await s.load()).tasks).toEqual(tasks)
    expect((await call(s.cookie, 'POST', '/data/sync', JSON.stringify({ x: 'x'.repeat(4_200_000) }))).status).toBe(413)
    // Other routes still refuse more than 10 KB.
    expect((await call('', 'POST', '/auth/login', { email: 'a@b.co', password: 'x'.repeat(20_000) })).status).toBe(413)
  })

  it('slows down a runaway tab, for that student only', async () => {
    const s = await student()
    let last
    for (let i = 0; i < 61; i++) last = await s.send({})
    expect(last!.status).toBe(429)
    expect(Number(last!.headers.get('retry-after'))).toBeGreaterThan(0)
    expect((await (await student()).send({})).status).toBe(200)
  })

  it('never caches or logs student data', async () => {
    const s = await student()
    expect((await call(s.cookie, 'GET', '/data')).headers.get('cache-control')).toBe('no-store')
    const rowError = Object.assign(new Error('violates check constraint'), { severity: 'ERROR', code: '23514', table: 'notes', detail: 'Failing row contains (my diary)', where: 'my diary' })
    const broken = createApp({ ...db, tx: () => Promise.reject(rowError) }, config, { info: () => {}, error: (_m, e) => logged.push(e) }, LIMITS).listen(0)
    const res = await fetch(`http://127.0.0.1:${(broken.address() as AddressInfo).port}/api/data/sync`, {
      method: 'POST',
      headers: { origin: ORIGIN, cookie: s.cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ accountId: s.accountId, clientId: 'tab-main-1', baseRevision: 0 }),
    })
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('diary')
    const last = logged.at(-1) as Error & { detail?: string; code?: string }
    expect(last.code).toBe('23514')
    expect(last.detail).toBeUndefined()
    expect(JSON.stringify(Object.entries(last))).not.toContain('diary')
    await new Promise((r) => broken.close(r))
  })
})

describe('academic terms', () => {
  it('stores the first and last day of a class, and leaves classes without them alone', async () => {
    const s = await student()
    await s.save({
      upsert: {
        courses: [course('c1')],
        sessions: [session('old', 'c1', { startsOn: '2026-09-07', endsOn: '2026-12-12' }), session('any', 'c1')],
      },
    })
    const data = await s.load()
    expect(data.sessions).toEqual([session('old', 'c1', { startsOn: '2026-09-07', endsOn: '2026-12-12' }), session('any', 'c1')])
    expect(data.sessions[1]).not.toHaveProperty('endsOn')
  })

  it('keeps term dates when an older app saves the class without knowing about them', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')], sessions: [session('old', 'c1', { startsOn: '2026-09-07', endsOn: '2026-12-12' })] } })
    // Version 1.8.0 moves the class to another room. It leaves term dates out.
    const res = await s.send({ upsert: { sessions: [session('old', 'c1', { room: 'GK 204' })] } }, s.state.revision)
    expect(res.status).toBe(200)
    // The answer carries the kept dates, so the old app's copy does not bring the class back into every week.
    expect(res.json.data.sessions[0]).toMatchObject({ id: 'old', startsOn: '2026-09-07', endsOn: '2026-12-12' })
    expect((await s.load()).sessions).toEqual([session('old', 'c1', { room: 'GK 204', startsOn: '2026-09-07', endsOn: '2026-12-12' })])
  })

  it('clears a date only when asked to, keeping the other', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')], sessions: [session('old', 'c1', { startsOn: '2026-09-07', endsOn: '2026-12-12' })] } })
    await s.save({ upsert: { sessions: [session('old', 'c1', { startsOn: '2026-09-07', endsOn: null })] } })
    expect((await s.load()).sessions).toEqual([session('old', 'c1', { startsOn: '2026-09-07' })])
  })

  it('refuses a malformed date, and saves nothing', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')] } })
    const res = await s.send({ upsert: { sessions: [session('bad', 'c1', { endsOn: 'next week' })] } })
    expect(res.status).toBe(400)
    expect((await s.load()).sessions).toEqual([])
  })
})

describe('the Tasks workspace mode', () => {
  it('follows the account, survives a save from an older app, and goes back to Classic on null', async () => {
    const s = await student()
    await s.save({ profile: { taskMode: 'workload' } })
    expect((await s.load()).profile.taskMode).toBe('workload')
    // Version 1.9.0 renames the student. It has never heard of workspace modes.
    await s.save({ profile: { name: 'Juan' } })
    expect((await s.load()).profile).toMatchObject({ name: 'Juan', taskMode: 'workload' })
    await s.save({ profile: { taskMode: null } })
    expect((await s.load()).profile.taskMode).toBeNull()
  })

  it('refuses a mode it does not know, and saves nothing', async () => {
    const s = await student()
    const res = await s.send({ profile: { taskMode: 'kanban' } })
    expect(res.status).toBe(400)
    expect((await s.load()).profile.taskMode).toBeNull()
  })
})

describe('task progress (Flow)', () => {
  it('is reported as something this API can store, on every load', async () => {
    const s = await student()
    expect((await call(s.cookie, 'GET', '/data')).json.features).toEqual(['taskMode', 'progress', 'estimate'])
    expect((await call(s.cookie, 'GET', '/data?since=0')).json).toMatchObject({ data: null, features: ['taskMode', 'progress', 'estimate'] })
  })

  it('stores it, keeps it when an older app saves the task without knowing, and clears it on null', async () => {
    const s = await student()
    await s.save({ upsert: { tasks: [task('essay', { progress: 'started' })] } })
    expect((await s.load()).tasks).toEqual([task('essay', { progress: 'started' })])
    // Version 1.9.0 marks it done. It has never heard of progress.
    const res = await s.send({ upsert: { tasks: [task('essay', { done: true })] } }, s.state.revision)
    expect(res.status).toBe(200)
    expect(res.json.data.tasks[0]).toMatchObject({ id: 'essay', done: true, progress: 'started' })
    await s.save({ upsert: { tasks: [task('essay', { done: true, progress: null })] } })
    expect((await s.load()).tasks).toEqual([task('essay', { done: true })])
  })

  it('refuses a stage it does not know, and saves nothing', async () => {
    const s = await student()
    const res = await s.send({ upsert: { tasks: [task('odd', { progress: 'blocked' })] } })
    expect(res.status).toBe(400)
    expect((await s.load()).tasks).toEqual([])
  })
})

describe('time estimates (Workload)', () => {
  it('stores whole minutes, keeps them when an older app saves the task without knowing, and clears on null', async () => {
    const s = await student()
    await s.save({ upsert: { tasks: [task('essay', { estimate: 90 })] } })
    expect((await s.load()).tasks).toEqual([task('essay', { estimate: 90 })])
    const res = await s.send({ upsert: { tasks: [task('essay', { done: true })] } }, s.state.revision)
    expect(res.status).toBe(200)
    expect(res.json.data.tasks[0]).toMatchObject({ id: 'essay', done: true, estimate: 90 })
    await s.save({ upsert: { tasks: [task('essay', { estimate: null })] } })
    expect((await s.load()).tasks).toEqual([task('essay')])
  })

  it('refuses an estimate that is not whole minutes from 5 to 1440, and saves nothing', async () => {
    const s = await student()
    for (const estimate of [0, 4, 1441, 30.5, '60']) {
      const res = await s.send({ upsert: { tasks: [task('odd', { estimate })] } })
      expect(res.status, String(estimate)).toBe(400)
    }
    expect((await s.load()).tasks).toEqual([])
  })
})

describe('exams', () => {
  it('stores an exam, keeps it when an older app saves the task without knowing, and clears it on request', async () => {
    const s = await student()
    await s.save({ upsert: { tasks: [task('midterm', { category: 'exam' })] } })
    expect((await s.load()).tasks).toEqual([task('midterm', { category: 'exam' })])
    // Version 1.8.0 marks it done. It has never heard of categories.
    const res = await s.send({ upsert: { tasks: [task('midterm', { done: true })] } }, s.state.revision)
    expect(res.status).toBe(200)
    expect(res.json.data.tasks[0]).toMatchObject({ id: 'midterm', done: true, category: 'exam' })
    expect((await s.load()).tasks).toEqual([task('midterm', { done: true, category: 'exam' })])
    await s.save({ upsert: { tasks: [task('midterm', { done: true, category: null })] } })
    expect((await s.load()).tasks).toEqual([task('midterm', { done: true })])
  })

  it('drops the exam category when an older app turns the exam into a to-do', async () => {
    const s = await student()
    await s.save({ upsert: { tasks: [task('midterm', { category: 'exam' })] } })
    // Version 1.8.0 changes the kind. It has never heard of categories, so it leaves category out.
    const res = await s.send({ upsert: { tasks: [task('midterm', { kind: 'todo' })] } }, s.state.revision)
    expect(res.status).toBe(200)
    // The answer carries the saved version, so no copy is left as a to-do that still acts like an exam.
    expect(res.json.data.tasks[0]).toMatchObject({ id: 'midterm', kind: 'todo' })
    expect(res.json.data.tasks[0].category ?? null).toBeNull()
    expect((await s.load()).tasks).toEqual([task('midterm', { kind: 'todo' })])
  })

  it('refuses a category it does not know, and saves nothing', async () => {
    const s = await student()
    const res = await s.send({ upsert: { tasks: [task('odd', { category: 'party' })] } })
    expect(res.status).toBe(400)
    expect((await s.load()).tasks).toEqual([])
  })
})

describe('points-based grades', () => {
  it('stores total possible with a component, and leaves older percentage entries alone', async () => {
    const s = await student()
    await s.save({
      upsert: {
        courses: [course('c1')],
        components: [component('quiz', 'c1', { score: 42, totalScore: 50 }), component('exam', 'c1', { score: 90 })],
      },
    })
    const data = await s.load()
    expect(data.components).toEqual([component('quiz', 'c1', { score: 42, totalScore: 50 }), component('exam', 'c1', { score: 90 })])
    expect(data.components[1]).not.toHaveProperty('totalScore')
  })

  it('keeps a saved total when an older app saves the component without knowing about totals', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')], components: [component('quiz', 'c1', { score: 42, totalScore: 50 })] } })
    // Version 1.6.0 renames the component. It has never heard of totalScore, so it leaves it out.
    const res = await s.send({ upsert: { components: [component('quiz', 'c1', { name: 'Quiz 1 (renamed)', score: 42 })] } }, s.state.revision)
    expect(res.status).toBe(200)
    // The answer carries the kept total, so the app's own copy does not drift to 42/100.
    expect(res.json.data.components[0]).toMatchObject({ id: 'quiz', totalScore: 50 })
    expect((await s.load()).components).toEqual([component('quiz', 'c1', { name: 'Quiz 1 (renamed)', score: 42, totalScore: 50 })])
  })

  it('goes back to the default of 100 only when asked to, on the same saved row', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')], components: [component('quiz', 'c1', { score: 42, totalScore: 50 })] } })
    await s.save({ upsert: { components: [component('quiz', 'c1', { score: 42 })] } })
    expect((await s.load()).components).toEqual([component('quiz', 'c1', { score: 42, totalScore: 50 })])
    await s.save({ upsert: { components: [component('quiz', 'c1', { score: 42, totalScore: null })] } })
    expect((await s.load()).components).toEqual([component('quiz', 'c1', { score: 42 })])
  })

  it('starts a new component without a total at the default of 100', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')], components: [component('fresh', 'c1', { score: 7 })] } })
    expect((await s.load()).components).toEqual([component('fresh', 'c1', { score: 7 })])
  })

  it('refuses a total of zero or less, and saves nothing', async () => {
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')] } })
    for (const totalScore of [0, -5]) {
      const res = await s.send({ upsert: { components: [component('quiz', 'c1', { score: 4, totalScore })] } })
      expect(res.status).toBe(400)
    }
    expect((await s.load()).components).toEqual([])
  })

  it('has the column from migration 005, and the database itself refuses a bad total', async () => {
    const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations WHERE name = '005_grade_component_total.sql'")
    expect(rows).toHaveLength(1)
    const s = await student()
    await s.save({ upsert: { courses: [course('c1')] } })
    await expect(
      db.query("INSERT INTO grade_components (user_id, id, course_id, name, weight, score, total_score, bytes) VALUES ($1, 'g', 'c1', 'x', 10, 1, 0, 1)", [
        s.accountId,
      ]),
    ).rejects.toThrow(/check/i)
  })
})
