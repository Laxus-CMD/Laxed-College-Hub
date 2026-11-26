/**
 * The app's sync engine against the real API and database, in one process.
 * Lives outside src/ and server/ because it uses both.
 */
import { createServer } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server/app.ts'
import { loadConfig } from '../server/config.ts'
import { connectDb } from '../server/db.ts'
import { migrate } from '../server/migrate.ts'
import { accountsApi, type Account } from '@/features/auth/api'
import { clearAllData, deleteCourse, loadDemoData } from '@/store/actions'
import { useAuthStore } from '@/store/useAuthStore'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { mergeImport, readDeviceDoc } from '@/sync/deviceData'
import { cleanDoc, readStores } from '@/sync/doc'
import { SyncEngine } from '@/sync/engine'
import { listPending, resetPendingMemory, savePending } from '@/sync/pending'
import { CLOSED, useSyncStore } from '@/sync/useSyncStore'
import { API_FEATURES } from '@/types'

const ORIGIN = 'http://localhost:5173'
const realFetch = globalThis.fetch
let base = ''
let stop: () => Promise<void>

/** The browser's one cookie, shared by every tab. */
let cookie = ''
/** Set to make the network misbehave: throw, or answer instead of the server. */
let network: ((method: string, path: string) => Response | Promise<Response> | undefined) | null = null
/** Runs after the server has answered, before the app hears about it. */
let afterServer: ((method: string, path: string) => void | Promise<void>) | null = null
let saves: { body: any; keepalive: boolean }[] = []
const engines: SyncEngine[] = []

async function api(method: string, path: string, body?: unknown, jar = cookie) {
  const res = await realFetch(base + path, {
    method,
    headers: { origin: ORIGIN, ...(jar ? { cookie: jar } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { res, set: res.headers.get('set-cookie')?.split(';')[0] }
}

beforeAll(async () => {
  const config = loadConfig({ NODE_ENV: 'test', SCRYPT_N: String(2 ** 12), APP_ORIGIN: ORIGIN })
  const db = await connectDb('memory://')
  await migrate(db)
  const app = createApp(db, config, { info() {}, error: console.error }, { loginPerIp: 1000, loginPerEmail: 1000, signupPerIp: 1000 }, null, {
    savesPerMinute: 10_000,
    loadsPerMinute: 10_000,
  })
  const server = createServer(app).listen(0)
  await new Promise((r) => server.once('listening', r))
  base = `http://127.0.0.1:${(server.address() as any).port}`
  stop = async () => {
    await new Promise((r) => server.close(r))
    await db.close()
  }
})
afterAll(() => stop())

let count = 0
/** Signs up a student and leaves the browser signed in as them. */
async function signUp(): Promise<Account & { password: string }> {
  const email = `sync${++count}@example.com`
  const password = 'a long passphrase 42'
  const { res, set } = await api('POST', '/api/auth/signup', { name: 'Juan Dela Cruz', email, password }, '')
  cookie = set!
  return { ...(await res.json()).user, password }
}
async function signIn(a: Account & { password: string }) {
  const { set } = await api('POST', '/api/auth/login', { email: a.email, password: a.password }, '')
  cookie = set!
}

/** What the server has for whoever the cookie belongs to. */
async function stored(jar = cookie) {
  const { res } = await api('GET', '/api/data', undefined, jar)
  return (await res.json()).data
}
/** A save from another device of the same account. */
let device = 0
async function otherDevice(a: Account, changes: object, baseRevision = 1e6, clientId = `phone-${++device}-xx`) {
  const { res } = await api('POST', '/api/data/sync', { accountId: a.id, clientId, baseRevision, ...changes })
  expect(res.status).toBe(200)
  return res.json()
}
const AT = '2026-11-22T03:00:00.000Z'
const note = (id: string, body: string) => ({ id, title: 'Limits', body, createdAt: AT, updatedAt: AT })

function newEngine() {
  const e = new SyncEngine()
  engines.push(e)
  return e
}
async function openApp(a: Account) {
  const e = newEngine()
  useAuthStore.setState({ account: a, guest: false })
  await e.open(a)
  return e
}
/** Runs the engine's own subscriptions, as start() does, for this test's engine only. */
async function startApp(a: Account) {
  const e = newEngine()
  const stores = [useScheduleStore, useTaskStore, useNoteStore, useGradeStore, useSettingsStore, useAuthStore]
  const unsubscribe: (() => void)[] = []
  const spies = stores.map((s) => {
    const real = s.subscribe
    return vi.spyOn(s as any, 'subscribe').mockImplementation((fn: any) => {
      const off = real(fn)
      unsubscribe.push(off)
      return off
    })
  })
  useAuthStore.setState({ account: a, guest: false })
  e.start()
  spies.forEach((s) => s.mockRestore())
  cleanups.push(() => unsubscribe.forEach((f) => f()))
  await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('ready'))
  return e
}
const cleanups: (() => void)[] = []
const status = () => useSyncStore.getState().status
const addTask = (title: string) => useTaskStore.getState().addTask({ kind: 'todo', title })
const titles = () => useTaskStore.getState().tasks.map((t) => t.title)

beforeEach(() => {
  localStorage.clear()
  resetPendingMemory()
  saves = []
  network = null
  afterServer = null
  useSyncStore.setState(CLOSED)
  useAuthStore.setState({ account: null, guest: false })
  useUiStore.setState({ toast: null, selectedNoteId: null })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    if (url.includes('/data/sync')) saves.push({ body: JSON.parse(String(init.body)), keepalive: Boolean(init.keepalive) })
    const fake = await network?.(method, url)
    if (fake) return fake
    const res = await realFetch(base + url, { method, headers: { ...(init.headers as object), origin: ORIGIN, cookie }, body: init.body })
    if (url.endsWith('/auth/logout')) cookie = ''
    await afterServer?.(method, url)
    return res
  })
})
afterEach(() => {
  cleanups.splice(0).forEach((f) => f())
  for (const e of engines.splice(0)) {
    e.discard()
    e.close()
  }
  vi.unstubAllGlobals()
})

describe('loading', () => {
  it('opens a new account empty, with their first name, and saves the name', async () => {
    const a = await signUp()
    const e = await openApp(a)
    expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: a.id })
    expect(readStores()).toMatchObject({ courses: [], tasks: [], notes: [], profile: { name: 'Juan', isDemo: false } })
    expect(await e.flush()).toBe(true)
    expect((await stored()).profile.name).toBe('Juan')
  })

  it('shows on a second device what the first one saved, field for field', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    useGradeStore.getState().setOverride('c-cs101', 3.5)
    useGradeStore.getState().setTarget('c-fndstat', 4)
    useGradeStore.getState().setScaleMin(4, 96)
    useGradeStore.getState().setPrior({ cgpa: 3.4, units: 36 })
    const before = readStores()
    expect(await e.flush()).toBe(true)

    e.close()
    expect(useSyncStore.getState().phase).toBe('closed')
    await openApp(a)
    const after = readStores()
    const byId = (list: { id: string }[]) => [...list].sort((x, y) => x.id.localeCompare(y.id))
    expect({ ...after, notes: byId(after.notes) }).toEqual({ ...before, notes: byId(before.notes) })
    expect(after.courses.map((c) => c.id)).toEqual(before.courses.map((c) => c.id))
    expect(useGradeStore.getState().overrides).toEqual({ 'c-cs101': 3.5 })
  })

  it('does not send anything back after only loading', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    await e.flush()
    e.close()
    saves = []
    const again = await openApp(a)
    expect(again.hasUnsaved()).toBe(false)
    await again.flush()
    expect(saves).toEqual([])
  })

  it('says so when loading fails, and can try again', async () => {
    const a = await signUp()
    network = () => Promise.reject(new TypeError('offline'))
    const e = await openApp(a)
    expect(useSyncStore.getState()).toMatchObject({ phase: 'load-error' })
    network = null
    await e.open(a)
    expect(useSyncStore.getState().phase).toBe('ready')
  })

  it('signs out when the session is gone', async () => {
    const a = await signUp()
    cookie = ''
    await openApp(a)
    expect(useAuthStore.getState().account).toBeNull()
  })
})

describe('saving', () => {
  it('saves by itself shortly after an edit, once for several edits', async () => {
    const a = await signUp()
    await startApp(a)
    await vi.waitFor(() => expect(status()).toBe('saved'), { timeout: 4000 })
    saves = []
    addTask('one')
    addTask('two')
    expect(status()).toBe('unsaved')
    await vi.waitFor(() => expect(status()).toBe('saved'), { timeout: 4000 })
    expect(saves).toHaveLength(1)
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['one', 'two'])
  })

  it('saves edits made during a slow save, without another nudge', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    addTask('first')
    let slow = true
    afterServer = async () => {
      if (!slow) return
      slow = false
      await new Promise((r) => setTimeout(r, 1500))
    }
    const save = e.save()
    await new Promise((r) => setTimeout(r, 200))
    addTask('second')
    await save
    await vi.waitFor(async () => expect((await stored()).tasks).toHaveLength(2), { timeout: 4000 })
    expect(status()).toBe('saved')
  })

  it('does not say "Saving" when it only loaded', async () => {
    const a = await signUp()
    await otherDevice(a, { upsert: { tasks: [{ id: 't1', kind: 'todo', title: 'x', done: false, source: 'manual' }] } })
    const seen = new Set<string>()
    cleanups.push(useSyncStore.subscribe((s) => seen.add(s.status)))
    await startApp(a)
    expect([...seen]).toEqual(['saved'])
  })

  it('sends only what changed, and no note text when only its links changed', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    await e.flush()
    saves = []
    deleteCourse('c-math201')
    await e.flush()
    expect(saves).toHaveLength(1)
    const { upsert, remove } = saves[0]!.body
    expect(remove.courses).toEqual(['c-math201'])
    expect(remove.sessions).toEqual(['s-math201'])
    expect(remove.components).toHaveLength(4)
    expect(upsert.courses).toEqual([])
    expect(upsert.tasks.map((t: any) => t.id)).toEqual(['t-ibp'])
    expect(upsert.notes).toHaveLength(1)
    expect(upsert.notes[0]).not.toHaveProperty('body')
    const data = await stored()
    expect(data.notes.find((n: any) => n.id === 'n-ibp').body).toContain('LIATE')
    expect(useSyncStore.getState().status).toBe('saved')
  })

  it('keeps edits made while a save is on its way', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    addTask('first')
    let edited = false
    afterServer = () => {
      if (!edited) addTask('second')
      edited = true
    }
    expect(await e.flush()).toBe(true)
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['first', 'second'])
  })

  it('keeps edits made while a save that brings other changes is on its way', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'from phone', done: false, source: 'manual' }] } })
    const mine = addTask('mine')
    let edited = false
    afterServer = () => {
      if (!edited) useTaskStore.getState().updateTask(mine, { title: 'mine, edited' })
      edited = true
    }
    expect(await e.flush()).toBe(true)
    expect(titles().sort()).toEqual(['from phone', 'mine, edited'])
    expect((await stored()).tasks.map((t: any) => t.title).sort()).toEqual(['from phone', 'mine, edited'])
  })

  it('undo after a delete was already saved brings the record back on the server', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    await e.flush()
    deleteCourse('c-cs101')
    await e.flush()
    useUiStore.getState().toast!.undo!()
    await e.flush()
    const data = await stored()
    expect(data.courses).toHaveLength(5)
    expect(data.components.filter((c: any) => c.courseId === 'c-cs101')).toHaveLength(4)
    expect(data.tasks.find((t: any) => t.id === 't-bst').courseId).toBe('c-cs101')
  })

  it('clears the account with Clear all data', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    await e.flush()
    clearAllData()
    await e.flush()
    expect(await stored()).toMatchObject({ courses: [], sessions: [], tasks: [], notes: [], components: [], profile: { name: 'Juan', isDemo: false } })
  })

  it('saves around nonsense in a form instead of getting stuck', async () => {
    const a = await signUp()
    const e = await openApp(a)
    useScheduleStore.setState({ courses: [{ id: 'c1', code: 'A\0B', name: 'x'.repeat(5000), units: Infinity, color: 'url(x)' }] })
    useTaskStore.getState().addTask({ kind: 'todo', title: 'cut \ud83d', due: 'soon', weight: NaN, courseId: 'no such course' })
    useNoteStore.getState().addNote({ title: 'n', body: 'b', sessionId: 'nowhere', sessionDate: '2026-11-22' })
    useGradeStore.setState({ prior: { cgpa: NaN, units: 1e300 } })
    expect(await e.flush()).toBe(true)
    expect(status()).toBe('saved')
    expect((await stored()).courses[0]).toMatchObject({ code: 'AB', units: 0 })
  })

  it('imports the same calendar on two devices without duplicates', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'Quiz', done: true, source: 'ics', externalId: 'uid-1' }] } })
    useTaskStore.getState().importTasks([{ kind: 'todo', title: 'Quiz', externalId: 'uid-1' }])
    expect(await e.flush()).toBe(true)
    expect(useTaskStore.getState().tasks).toHaveLength(1)
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ id: 't-phone', done: true })
  })
})

/** Makes the API look like one before 1.10.0 (no features listed) while `on` is true. */
function olderApi() {
  const state: { on: boolean; during?: () => void } = { on: true }
  const real = globalThis.fetch
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const res = await real(input, init)
    if (!String(input).includes('/api/data') || (init?.method ?? 'GET') !== 'GET') return res
    // Something the student does while the answer is on its way.
    if (!state.on) {
      const during = state.during
      state.during = undefined
      during?.()
      return res
    }
    const { features: _f, ...body } = await res.json()
    return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
  })
  cleanups.push(() => spy.mockRestore())
  return state
}

describe('what the API can store', () => {
  it('keeps the saved value when the student edits the task while that reload is on its way', async () => {
    const a = await signUp()
    const task = { id: 't-est', kind: 'assignment', title: 'Essay', done: false, source: 'manual', estimate: 90, progress: 'started' }
    await otherDevice(a, { upsert: { tasks: [task] } })
    const old = olderApi()
    const e = await openApp(a)
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => ({ ...t, estimate: null, progress: null })) })
    ;(e as any).open_.base = readStores()
    old.on = false
    old.during = () => useTaskStore.getState().updateTask('t-est', { title: 'Essay, renamed meanwhile' })
    ;(e as any).lastChecked = 0
    await e.recheck()
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ title: 'Essay, renamed meanwhile', estimate: 90, progress: 'started' })
    expect(await e.flush()).toBe(true)
    expect((await stored()).tasks[0]).toMatchObject({ title: 'Essay, renamed meanwhile', estimate: 90, progress: 'started' })
  })

  it('holds back what the API did not list when a change kept in the browser is sent again', async () => {
    const a = await signUp()
    const task = { id: 't-est', kind: 'assignment', title: 'Essay', done: false, source: 'manual', estimate: 90, progress: 'started' }
    await otherDevice(a, { upsert: { tasks: [task] } })
    // Made through an API that listed nothing, so the tab held null for both fields.
    savePending({
      accountId: a.id,
      email: a.email,
      clientId: 'old-tab-xx',
      revision: 1,
      changes: {
        upsert: { courses: [], sessions: [], tasks: [{ ...task, title: 'Essay, renamed offline', estimate: null, progress: null } as any], notes: [], components: [] },
        remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
      },
      features: [],
    })
    await openApp(a)
    expect((await stored()).tasks[0]).toMatchObject({ title: 'Essay, renamed offline', estimate: 90, progress: 'started' })
  })

  it('loads everything again when the API starts storing a field, so the next edit does not clear it', async () => {
    const a = await signUp()
    const task = { id: 't-est', kind: 'assignment', title: 'Essay', done: false, source: 'manual', estimate: 90, progress: 'started' }
    await otherDevice(a, { upsert: { tasks: [task] } })
    const old = olderApi()
    const e = await openApp(a)
    // Through an API that lists nothing, the fields are not in the stores (a rolled-back API strips them).
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => ({ ...t, estimate: null, progress: null })) })
    ;(e as any).open_.base = readStores()
    expect(useSyncStore.getState().features).toEqual([])
    // The API is upgraded while the tab stays open, with nothing new in the account.
    old.on = false
    ;(e as any).lastChecked = 0
    await e.recheck()
    expect(useSyncStore.getState().features).toEqual([...API_FEATURES])
    expect(useTaskStore.getState().tasks[0]).toMatchObject({ estimate: 90, progress: 'started' })
    useTaskStore.getState().updateTask('t-est', { title: 'Essay, final' })
    expect(await e.flush()).toBe(true)
    expect((await stored()).tasks[0]).toMatchObject({ title: 'Essay, final', estimate: 90, progress: 'started' })
  })

  it('learns it with the first load', async () => {
    const a = await signUp()
    await openApp(a)
    expect(useSyncStore.getState().features).toEqual([...API_FEATURES])
  })

  it('treats an API that says nothing (before 1.10.0) as storing none of it', async () => {
    const a = await signUp()
    const real = globalThis.fetch
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const res = await real(input, init)
      if (!String(input).includes('/api/data') || (init?.method ?? 'GET') !== 'GET') return res
      const { features: _f, ...body } = await res.json()
      return new Response(JSON.stringify(body), { status: res.status, headers: res.headers })
    })
    try {
      const e = await openApp(a)
      expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', features: [] })
      // Nothing the API did not list is sent, and the save is not stuck on it.
      useSettingsStore.getState().setTaskMode('flow')
      useTaskStore.getState().addTask({ kind: 'todo', title: 'Started elsewhere', progress: 'started', estimate: 60 })
      expect(await e.flush()).toBe(true)
      expect(status()).toBe('saved')
      const saved = await stored()
      expect(saved.profile.taskMode).toBeNull()
      expect(saved.tasks).toMatchObject([{ title: 'Started elsewhere' }])
      expect(saved.tasks[0]).not.toHaveProperty('progress')
      expect(saved.tasks[0]).not.toHaveProperty('estimate')
      expect(e.hasUnsaved()).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('starts over for each account', async () => {
    const a = await signUp()
    useSyncStore.setState({ features: ['progress'] })
    const e = newEngine()
    useAuthStore.setState({ account: a, guest: false })
    const opening = e.open(a)
    expect(useSyncStore.getState().features).toEqual([])
    await opening
  })
})

describe('two devices', () => {
  it('shows another device\'s changes when coming back to the tab', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'from phone', done: false, source: 'manual' }] } })
    await e.recheck()
    expect(titles()).toEqual([]) // Checked moments ago.
    ;(e as any).lastChecked = 0
    await e.recheck()
    expect(titles()).toEqual(['from phone'])
    expect(status()).toBe('saved')
    expect(e.hasUnsaved()).toBe(false)
  })

  it('keeps both versions of a note, and keeps the student in theirs while they type', async () => {
    const a = await signUp()
    const e = await openApp(a)
    useNoteStore.setState({ notes: [note('n1', 'start')] })
    await e.flush()
    await otherDevice(a, { upsert: { notes: [note('n1', 'phone')] } })
    useUiStore.getState().selectNote('n1')
    useNoteStore.getState().updateNote('n1', { body: 'laptop' })
    let typed = false
    afterServer = () => {
      if (!typed) useNoteStore.getState().updateNote('n1', { body: 'laptop, still typing' })
      typed = true
    }
    expect(await e.flush()).toBe(true)
    const selected = useUiStore.getState().selectedNoteId
    expect(selected).not.toBe('n1')
    const notes = useNoteStore.getState().notes
    expect(notes.find((n) => n.id === selected)!.body).toBe('laptop, still typing')
    expect(notes.find((n) => n.id === 'n1')!.body).toBe('phone')
    expect((await stored()).notes).toHaveLength(2)
    expect(useUiStore.getState().toast?.message).toContain('Both versions')

    // Typing on does not make more copies.
    useNoteStore.getState().updateNote(selected!, { body: 'done' })
    await e.flush()
    expect((await stored()).notes).toHaveLength(2)
  })

  it('drops an Undo that would wipe out what another device just added', async () => {
    const a = await signUp()
    const e = await openApp(a)
    loadDemoData()
    await e.flush()
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'from phone', done: false, source: 'manual' }] } })
    deleteCourse('c-cs101')
    expect(useUiStore.getState().toast?.undo).toBeDefined()
    await e.flush()
    expect(useUiStore.getState().toast).toBeNull()
    expect(titles()).toContain('from phone')
  })
})

describe('when saving fails', () => {
  it('keeps the newer edit when an earlier request reaches the real API after retry', async () => {
    const a = await signUp()
    const engine = await openApp(a)
    await engine.flush()
    useSettingsStore.getState().setName('First edit')
    const transport = globalThis.fetch
    let deliverLate!: () => Promise<Response>
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      deliverLate = () => transport(url, init)
      return Promise.reject(new TypeError('Connection lost before acknowledgement'))
    })
    await engine.save()
    expect(status()).toBe('retrying')
    vi.stubGlobal('fetch', transport)
    useSettingsStore.getState().setName('Second edit')
    await engine.retryNow()
    const acknowledged = await stored()
    expect(acknowledged.profile.name).toBe('Second edit')
    expect((await deliverLate()).status).toBe(200)
    expect(await stored()).toEqual(acknowledged)
  })

  it('keeps trying and recovers', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    addTask('offline')
    network = () => Promise.reject(new TypeError('offline'))
    expect(await e.flush()).toBe(false)
    expect(status()).toBe('retrying')
    expect(e.hasUnsaved()).toBe(true)
    network = null
    await e.retryNow()
    expect(status()).toBe('saved')
    expect((await stored()).tasks).toHaveLength(1)
  })

  it('is not confused when the server saved but the answer got lost', async () => {
    const a = await signUp()
    const e = await openApp(a)
    useNoteStore.setState({ notes: [note('n1', 'start')] })
    await e.flush()
    useNoteStore.getState().updateNote('n1', { body: 'more' })
    addTask('a task')
    afterServer = () => {
      afterServer = null
      throw new TypeError('connection reset')
    }
    await e.save()
    expect(status()).toBe('retrying')
    useNoteStore.getState().updateNote('n1', { body: 'more and more' })
    await e.retryNow()
    expect(status()).toBe('saved')
    const data = await stored()
    expect(data.notes.map((n: any) => n.body)).toEqual(['more and more'])
    expect(data.tasks).toHaveLength(1)
  })

  it('shows the quota message and does not hammer the server', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    saves = []
    useTaskStore.setState({ tasks: [] })
    useScheduleStore.setState({ courses: Array.from({ length: 200 }, (_, i) => ({ id: `c${i}`, code: 'A', name: '', units: 3, color: '#fff' })) })
    await e.flush()
    useScheduleStore.getState().addCourse({ code: 'B', name: '', units: 3, color: '#fff' })
    expect(await e.flush()).toBe(false)
    expect(useSyncStore.getState()).toMatchObject({ status: 'blocked' })
    expect(useSyncStore.getState().message).toContain('200 courses')
    useScheduleStore.getState().removeCourse('c0')
    expect(await e.flush()).toBe(true)
    expect(status()).toBe('saved')
  })

  it('holds unsaved changes when the session ends, and saves them after signing in again', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    const jar = cookie
    addTask('before the session ended')
    useNoteStore.getState().addNote({ title: 'Essay', body: 'long text' })
    cookie = ''
    await e.save()
    expect(useAuthStore.getState().account).toBeNull()
    expect(useSyncStore.getState().heldFor).toBe(a.email)
    // Kept in this browser, so it is not lost if this tab closes before they sign in.
    expect(listPending(a.id).flatMap((p) => p.changes.upsert.tasks.map((t) => t.title))).toEqual(['before the session ended'])
    expect(e.hasUnsaved()).toBe(false)
    expect(titles()).not.toContain('before the session ended')

    // Meanwhile another device saves too.
    cookie = jar
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'from phone', done: false, source: 'manual' }] } })
    await signIn(a)
    useAuthStore.getState().signInAccount(a)
    await vi.waitFor(() => expect(status()).toBe('saved'))
    await vi.waitFor(() => expect(titles().sort()).toEqual(['before the session ended', 'from phone']))
    const data = await stored()
    expect(data.tasks).toHaveLength(2)
    expect(data.notes[0].body).toBe('long text')
    expect(useSyncStore.getState().heldFor).toBeNull()
    expect(e.hasUnsaved()).toBe(false)
    expect(listPending()).toEqual([])
  })

  it('does not give held changes to a different student', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    addTask('private to A')
    cookie = ''
    await e.save()
    const b = await signUp()
    useAuthStore.getState().signInAccount(b)
    await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: b.id }))
    addTask('B task')
    await e.flush()
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['B task'])
    expect(useSyncStore.getState().heldFor).toBe(a.email)

    await signIn(a)
    useAuthStore.getState().signInAccount(a)
    await vi.waitFor(async () => expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['private to A']))
    expect(titles()).toEqual(['private to A'])
  })

  it('sends small last-second changes in a way that survives closing the page', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    saves = []
    addTask('last second')
    await e.save({ closing: true })
    expect(saves.map((s) => s.keepalive)).toEqual([true])
    useNoteStore.getState().addNote({ body: 'x'.repeat(90_000) })
    await e.save({ closing: true })
    expect(saves.map((s) => s.keepalive)).toEqual([true, false])
  })

  it('warns before closing only while something unsaved would be lost', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    network = () => Promise.reject(new TypeError('offline'))
    addTask('kept on this device')
    // Written down right away when the page closes, so it is saved next time: no need to ask.
    expect(leave()).toBe(false)
    expect(listPending(a.id)).toHaveLength(1)
    // If the browser will not keep it, closing would lose it.
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    addTask('only in this tab')
    expect(leave()).toBe(true)
    refuse.mockRestore()
    network = null
    await e.flush()
    expect(leave()).toBe(false)
    expect(listPending()).toEqual([])
  })
})

describe('accounts and the browser', () => {
  it('never mixes two accounts when another tab signs in to someone else', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    const jarA = cookie
    const b = await signUp() // In another tab. This tab still shows A, with B's cookie.
    addTask('written by A')
    await e.save()
    await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: b.id }))
    expect(useAuthStore.getState().account?.id).toBe(b.id)
    expect(titles()).toEqual([])
    expect((await stored()).tasks).toEqual([])
    expect((await stored(jarA)).tasks).toEqual([])
    expect(useSyncStore.getState().heldFor).toBe(a.email)
  })

  it('loads the account the session really belongs to', async () => {
    const a = await signUp()
    const b = await signUp()
    await otherDevice(b, { upsert: { tasks: [{ id: 't1', kind: 'todo', title: 'B task', done: false, source: 'manual' }] } })
    // This tab remembers A, but another tab signed in as B.
    let shownAsA = false
    const off = useTaskStore.subscribe((s) => {
      if (useSyncStore.getState().accountId === a.id && s.tasks.some((t) => t.title === 'B task')) shownAsA = true
    })
    cleanups.push(off)
    await startApp(a)
    await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: b.id }))
    expect(useAuthStore.getState().account?.id).toBe(b.id)
    expect(shownAsA).toBe(false)
  })

  it('ignores a late answer to a save after switching accounts', async () => {
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    // Makes the server answer A's save with a full document.
    await otherDevice(a, { upsert: { tasks: [{ id: 't-phone', kind: 'todo', title: 'A from phone', done: false, source: 'manual' }] } })
    addTask('A task')
    let release = () => {}
    const wait = new Promise<void>((r) => (release = r))
    afterServer = (_method, path) => {
      if (!path.endsWith('/data/sync')) return
      afterServer = null
      return wait
    }
    const save = e.save()
    await new Promise((r) => setTimeout(r, 50))
    const b = await signUp()
    useAuthStore.getState().signInAccount(b)
    await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: b.id }))
    release()
    await save
    expect(titles()).toEqual([])
    addTask('B task')
    expect(await e.flush()).toBe(true)
    // A's task is still kept for A, and only for A.
    expect(listPending(a.id).flatMap((p) => p.changes.upsert.tasks.map((t) => t.title))).toEqual(['A task'])
    expect(listPending(b.id)).toEqual([])
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['B task'])
  })

  it('never shows another account\'s data while loading or rechecking', async () => {
    const a = await signUp()
    const e = await startApp(a)
    addTask('A task')
    await e.flush()
    const b = await signUp()
    ;(e as any).lastChecked = 0
    await e.recheck()
    await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', accountId: b.id }))
    expect(titles()).toEqual([])
  })

  it('leaves nothing of the account in the browser, during or after', async () => {
    const a = await signUp()
    const e = await startApp(a)
    useNoteStore.getState().addNote({ title: 'Secret diary', body: 'secret body' })
    addTask('secret task')
    useSettingsStore.getState().setName('Secret name')
    await e.flush()
    const dump = () => JSON.stringify({ ...localStorage })
    expect(dump()).not.toMatch(/secret/i)
    e.discard()
    await accountsApi.logout()
    useAuthStore.getState().endedOnServer()
    expect(dump()).not.toMatch(/secret/i)
    expect(JSON.stringify(readStores())).not.toMatch(/secret/i)
  })

  it('keeps guest data in the browser apart from the account, and brings it back on sign-out', async () => {
    useAuthStore.setState({ guest: true })
    clearAllData()
    addTask('guest task')
    const saved = localStorage.getItem('college-hub.tasks')
    expect(saved).toContain('guest task')

    const a = await signUp()
    const e = await startApp(a)
    expect(titles()).toEqual([])
    addTask('account task')
    await e.flush()
    expect(localStorage.getItem('college-hub.tasks')).toBe(saved)
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['account task'])

    useAuthStore.getState().signOut()
    expect(useSyncStore.getState().phase).toBe('closed')
    expect(titles()).toEqual(['guest task'])
    addTask('another guest task')
    expect(localStorage.getItem('college-hub.tasks')).toContain('another guest task')
  })

  it('cannot undo into the next account', async () => {
    const a = await signUp()
    const e = await startApp(a)
    loadDemoData()
    await e.flush()
    deleteCourse('c-cs101')
    await e.flush()
    useAuthStore.getState().signOut()
    expect(useUiStore.getState().toast).toBeNull()
  })

  it('ignores a slow answer for an account that has signed out', async () => {
    const a = await signUp()
    const e = await startApp(a)
    addTask('A task')
    await e.flush()
    useAuthStore.getState().sessionEnded()
    let release = () => {}
    const wait = new Promise<void>((r) => (release = r))
    afterServer = (method, path) => (path.endsWith('/data') ? wait : undefined)
    useAuthStore.getState().signInAccount(a)
    expect(useSyncStore.getState().phase).toBe('loading')
    useAuthStore.getState().sessionEnded()
    release()
    await new Promise((r) => setTimeout(r, 50))
    expect(useSyncStore.getState().phase).toBe('closed')
    expect(titles()).not.toContain('A task')
  })
})

describe('importing', () => {
  /** A guest with a full term in this browser, who then signs in. */
  async function guestThenAccount() {
    useAuthStore.setState({ account: null, guest: true })
    loadDemoData()
    useSettingsStore.getState().setDemo(false)
    useGradeStore.getState().setTarget('c-cs101', 4)
    const guest = readStores()
    const a = await signUp()
    const e = await startApp(a)
    await e.flush()
    return { a, e, guest }
  }
  const importAll = (e: SyncEngine) => e.addAll(mergeImport(readStores(), readDeviceDoc()!).doc)

  it('puts everything from the browser on the server', async () => {
    const { e, guest } = await guestThenAccount()
    expect(await importAll(e)).toBe('saved')
    expect(status()).toBe('saved')
    const data = await stored()
    const onServer = cleanDoc({ ...data, profile: data.profile })
    for (const k of ['courses', 'sessions', 'tasks', 'components'] as const) expect(onServer[k]).toEqual(guest[k])
    expect(onServer.notes.map((n) => n.body).sort()).toEqual(guest.notes.map((n) => n.body).sort())
    expect(mergeImport(readStores(), readDeviceDoc()!).anything).toBe(false)
  })

  it('keeps the browser copy when the account cannot store some of it yet', async () => {
    const { e } = await guestThenAccount()
    const before = readStores()
    const doc = cleanDoc({ ...before, tasks: [...before.tasks, { id: 'g-est', kind: 'todo', title: 'Started at home', done: false, source: 'manual', progress: 'started', estimate: 60 }] })
    // As an API before 1.10.0 would report.
    useSyncStore.setState({ features: [] })
    expect(await e.addAll(doc)).toEqual({ saved: 'partly', unstored: ['progress', 'estimate'] })
  })

  it('takes nothing when the account would be too full, and says why', async () => {
    const { e } = await guestThenAccount()
    addTask('already here')
    await e.flush()
    const before = readStores()
    const tasks = Array.from({ length: 5000 }, (_, i) => ({ id: `big${i}`, kind: 'todo' as const, title: `t${i}`, done: false, source: 'manual' as const }))
    const outcome = await e.addAll(cleanDoc({ ...before, tasks: [...before.tasks, ...tasks] }))
    expect(outcome).toEqual({ error: expect.stringContaining('5,000 tasks') })
    expect(readStores()).toEqual(before)
    expect(status()).toBe('saved')
    expect((await stored()).tasks).toHaveLength(1)
    expect(e.hasUnsaved()).toBe(false)
  })

  it('keeps trying when the connection drops during an import', async () => {
    const { e } = await guestThenAccount()
    network = (method) => (method === 'POST' ? Promise.reject(new TypeError('offline')) : undefined)
    expect(await importAll(e)).toBe('pending')
    expect(useScheduleStore.getState().courses).toHaveLength(5)
    expect(readDeviceDoc()!.courses).toHaveLength(5)
    network = null
    await e.retryNow()
    expect((await stored()).courses).toHaveLength(5)
  })

  it('does not start while something else is unsaved', async () => {
    const { e } = await guestThenAccount()
    network = () => Promise.reject(new TypeError('offline'))
    addTask('unsaved')
    expect(await importAll(e)).toEqual({ error: expect.stringContaining('not saved yet') })
    expect(useScheduleStore.getState().courses).toEqual([])
  })

  it('finishes after signing in again when the session ended during it', async () => {
    const { a, e } = await guestThenAccount()
    cookie = ''
    expect(await importAll(e)).toBe('pending')
    expect(useSyncStore.getState().heldFor).toBe(a.email)
    expect(readDeviceDoc()!.courses).toHaveLength(5)
    await signIn(a)
    useAuthStore.getState().signInAccount(a)
    await vi.waitFor(async () => expect((await stored()).courses).toHaveLength(5))
  })
})

describe('after a reload or crash', () => {
  /** The tab goes away without its page-closing handlers running, like a crash or a killed browser. */
  function crash(e: SyncEngine) {
    e.stop()
    // A fresh page starts with empty stores.
    for (const s of [useScheduleStore, useTaskStore, useNoteStore, useGradeStore, useSettingsStore]) (s.setState as (x: unknown) => void)(s.getInitialState())
    useSyncStore.setState(CLOSED)
    useUiStore.setState({ toast: null })
  }
  const offline = () => {
    network = () => Promise.reject(new TypeError('Failed to fetch'))
  }
  const serverTitles = async () => ((await stored()).tasks.map((t: any) => t.title) as string[]).sort()

  it('saves what was typed offline once a reloaded tab is back online', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    offline()
    addTask('typed offline')
    await e.save()
    expect(useSyncStore.getState()).toMatchObject({ status: 'retrying', local: 'device' })
    crash(e)

    // Reloaded while still offline: nothing is lost, and nothing is shown that is not real.
    useAuthStore.setState({ account: a, guest: false })
    const again = newEngine()
    await again.open(a)
    expect(useSyncStore.getState().phase).toBe('load-error')
    expect(listPending(a.id)).toHaveLength(1)

    network = null
    await again.open(a)
    expect(useSyncStore.getState()).toMatchObject({ phase: 'ready', status: 'saved', local: 'none' })
    expect(titles()).toEqual(['typed offline'])
    expect(await serverTitles()).toEqual(['typed offline'])
    expect(listPending()).toEqual([])
    expect(useUiStore.getState().toast?.message).toMatch(/last visit were saved/)
  })

  it('saves edits made during a save whose answer never came, without doubling or copying anything', async () => {
    const a = await signUp()
    const e = await openApp(a)
    const id = useNoteStore.getState().addNote({ title: 'Lecture', body: 'first draft' })
    await e.flush()
    useNoteStore.getState().updateNote(id, { body: 'second draft' })
    addTask('in the save')
    // The save reaches the server and is stored, then the tab dies before hearing back.
    afterServer = (_m, path) => (path.endsWith('/data/sync') ? new Promise<void>(() => {}) : undefined)
    void e.save()
    await vi.waitFor(async () => expect((await stored()).notes[0].body).toBe('second draft'))
    addTask('typed while saving')
    e.keepNow() // The short timer after an edit does this.
    expect(useSyncStore.getState().local).toBe('device')
    const firstTab = saves[saves.length - 1]!.body.clientId
    afterServer = null
    crash(e)

    saves = []
    await openApp(a)
    expect(saves).toHaveLength(1)
    // Sent as the tab that made it, and without what the server already had.
    expect(saves[0]!.body).toMatchObject({ clientId: firstTab, upsert: { notes: [] } })
    expect(saves[0]!.body.upsert.tasks.map((t: any) => t.title)).toEqual(['typed while saving'])
    const data = await stored()
    expect(data.notes.map((n: any) => [n.title, n.body])).toEqual([['Lecture', 'second draft']])
    expect(await serverTitles()).toEqual(['in the save', 'typed while saving'])
    expect(listPending()).toEqual([])
  })

  it('still keeps both versions of a note edited elsewhere before the tab came back', async () => {
    const a = await signUp()
    const e = await openApp(a)
    useNoteStore.setState({ notes: [note('n1', 'start')] })
    await e.flush()
    offline()
    useNoteStore.getState().updateNote('n1', { body: 'laptop version' })
    await e.save()
    crash(e)
    network = null
    await otherDevice(a, { upsert: { notes: [note('n1', 'phone version')] } })

    await openApp(a)
    const bodies = (await stored()).notes.map((n: any) => n.body).sort()
    expect(bodies).toEqual(['laptop version', 'phone version'])
    expect(useNoteStore.getState().notes.map((n) => n.body).sort()).toEqual(['laptop version', 'phone version'])
  })

  it('gives kept changes only to their own account, even after a reload', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    offline()
    addTask('private to A')
    await e.save()
    crash(e)
    network = null

    const b = await signUp()
    await openApp(b)
    expect(titles()).toEqual([])
    expect(await serverTitles()).toEqual([])
    expect(useSyncStore.getState().heldFor).toBe(a.email)
    expect(listPending(a.id)).toHaveLength(1)

    await signIn(a)
    await openApp(a)
    expect(await serverTitles()).toEqual(['private to A'])
    expect(listPending()).toEqual([])
  })

  /** The raw drafts in localStorage, unescaped, so a title can be matched with its quotes. */
  const draftsOnDevice = () =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('college-hub.pending.'))
      .map((k) => localStorage.getItem(k))
      .join(' ')

  /** Offline, a task written down on the device, then renamed while the browser refuses to store more. */
  async function renamedWhileStorageRefuses() {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    offline()
    addTask('first')
    await e.save()
    expect(listPending(a.id)).toHaveLength(1)
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    useTaskStore.getState().updateTask(useTaskStore.getState().tasks[0]!.id, { title: 'renamed' })
    e.keepNow()
    expect(useSyncStore.getState().local).toBe('memory')
    expect(e.hasUnsaved()).toBe(true)
    return { a, e, refuse }
  }

  it('says so when the browser will not keep a copy, and keeps the last copy it did', async () => {
    const { a, e, refuse } = await renamedWhileStorageRefuses()
    // The rename is only in this tab, but the task itself is still on the device.
    expect(draftsOnDevice()).toMatch(/"first"/)
    refuse.mockRestore()
    resetPendingMemory()
    crash(e)
    network = null
    await openApp(a)
    // The rename was lost with the tab, as the status warned. The task was not.
    expect(await serverTitles()).toEqual(['first'])
    expect(listPending()).toEqual([])
  })

  it('never sends that older copy once the newer changes are saved', async () => {
    const { a, e, refuse } = await renamedWhileStorageRefuses()
    network = null
    // Still refusing to store, but the connection is back and the rename reaches the account.
    expect(await e.flush()).toBe(true)
    expect(draftsOnDevice()).not.toMatch(/"first"/)
    expect(listPending()).toEqual([])
    refuse.mockRestore()
    crash(e)
    await openApp(a)
    expect(await serverTitles()).toEqual(['renamed'])
  })

  it('leaves changes from a tab that is still open to that tab', async () => {
    const a = await signUp()
    const other = 'tab-still-open'
    savePending({
      accountId: a.id,
      email: a.email,
      clientId: other,
      revision: 0,
      changes: {
        upsert: { courses: [], sessions: [], tasks: [{ id: 't-open', kind: 'todo', title: 'other tab', done: false, source: 'manual' } as any], notes: [], components: [] },
        remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
      },
    })
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: { request: () => new Promise(() => {}), query: async () => ({ held: [{ name: `college-hub.tab.${other}` }] }) },
    })
    await openApp(a)
    expect(await serverTitles()).toEqual([])
    expect(listPending(a.id)).toHaveLength(1)
  })

  it('deletes kept changes when the student signs out anyway', async () => {
    const a = await signUp()
    const e = await openApp(a)
    await e.flush()
    offline()
    addTask('dropped on purpose')
    await e.save()
    expect(listPending(a.id)).toHaveLength(1)
    e.discard()
    expect(listPending()).toEqual([])
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/dropped on purpose/)
  })
})

describe('recovery never deletes the last kept copy', () => {
  const NONE = { courses: [], sessions: [], tasks: [], notes: [], components: [] }
  const keptTask = (a: Account, clientId: string, title: string, revision = 0) =>
    savePending({
      accountId: a.id,
      email: a.email,
      clientId,
      revision,
      changes: { upsert: { ...NONE, tasks: [{ id: 't-kept', kind: 'todo', title, done: false, source: 'manual' } as any] }, remove: { ...NONE } },
    })
  const keptTitles = (a: Account) => listPending(a.id).flatMap((p) => p.changes.upsert.tasks.map((t) => t.title))

  it('stops recovery when the account switches while a rejected entry is in flight', async () => {
    const b = await signUp()
    const a = await signUp()
    keptTask(a, 'tab-first', 'first')
    keptTask(a, 'tab-second', 'second')
    let release!: (response: Response) => void
    network = (method, path) => method === 'POST' && path.endsWith('/data/sync')
      ? new Promise<Response>((resolve) => { release = resolve })
      : undefined
    const engine = newEngine()
    const opening = engine.open(a)
    await vi.waitFor(() => expect(saves).toHaveLength(1))
    await signIn(b)
    await engine.open(b)
    release(new Response('{}', { status: 422 }))
    await opening
    expect(saves).toHaveLength(1)
    expect(listPending(a.id)).toHaveLength(2)
    expect(useSyncStore.getState()).toMatchObject({ accountId: b.id, phase: 'ready' })
    expect(titles()).toEqual([])
  })

  it('keeps the original draft when the account refuses it and the browser will not store the replacement', async () => {
    const a = await signUp()
    keptTask(a, 'tab-gone', 'refused by the account')
    // The account refuses the recovered save.
    network = (method, path) =>
      method === 'POST' && path.endsWith('/data/sync')
        ? new Response(JSON.stringify({ error: 'Your account is full.' }), { status: 422, headers: { 'Content-Type': 'application/json' } })
        : undefined
    // And the browser refuses to store the copy written under the new tab.
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    try {
      const e = await openApp(a)
      expect(titles()).toEqual(['refused by the account'])
      await vi.waitFor(() => expect(useSyncStore.getState()).toMatchObject({ status: 'blocked', local: 'memory' }))
      e.stop()
    } finally {
      refuse.mockRestore()
    }
    network = null
    // A fresh page: this tab's memory is gone.
    resetPendingMemory()
    expect(keptTitles(a)).toEqual(['refused by the account'])
  })

  it('keeps a newer draft the original tab writes while its older one is being recovered', async () => {
    const a = await signUp()
    keptTask(a, 'tab-other', 'older')
    let release = () => {}
    const held = new Promise<void>((r) => (release = r))
    afterServer = (method, path) => {
      if (method !== 'POST' || !path.endsWith('/data/sync')) return
      afterServer = null
      return held
    }
    const opening = openApp(a)
    // The server has stored the older draft, and its answer is on hold.
    await vi.waitFor(async () => expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['older']))
    // Meanwhile the tab that made it writes something newer.
    keptTask(a, 'tab-other', 'newer')
    release()
    const first = await opening
    expect(keptTitles(a)).toEqual(['newer'])

    // And the newer one is saved the next time the account opens, on a fresh page.
    first.stop()
    useSyncStore.setState(CLOSED)
    resetPendingMemory()
    await openApp(a)
    expect((await stored()).tasks.map((t: any) => t.title)).toEqual(['newer'])
    expect(listPending()).toEqual([])
  })
})

describe('points-based grades in the account', () => {
  const COURSE = { id: 'c1', code: 'CS 101', name: 'Data Structures', units: 3, color: '#4fd1c5' }
  const setGrades = () => {
    useScheduleStore.setState({ courses: [COURSE], sessions: [] })
    useGradeStore.setState({
      components: [
        { id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 },
        { id: 'exam', courseId: 'c1', name: 'Midterm', weight: 40, score: 90 },
      ],
    })
  }

  it('keeps custom totals through account sync, on another device and after a reload', async () => {
    const a = await signUp()
    const e = await openApp(a)
    setGrades()
    expect(await e.flush()).toBe(true)
    expect((await stored()).components).toEqual([
      { id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 },
      { id: 'exam', courseId: 'c1', name: 'Midterm', weight: 40, score: 90 },
    ])

    // A fresh page signs in again and gets the same totals back.
    e.stop()
    useSyncStore.setState(CLOSED)
    useGradeStore.setState({ components: [] })
    const again = await openApp(a)
    expect(useGradeStore.getState().components).toEqual([
      { id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 },
      // The default, held as an explicit null so a later clear can say so.
      { id: 'exam', courseId: 'c1', name: 'Midterm', weight: 40, score: 90, totalScore: null },
    ])

    // Changing only the total sends it, and clearing it goes back to 100.
    saves = []
    useGradeStore.getState().updateComponent('quiz', { totalScore: 60 })
    expect(await again.flush()).toBe(true)
    expect(saves[0]!.body.upsert.components).toEqual([{ id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 60 }])
    saves = []
    useGradeStore.getState().updateComponent('quiz', { totalScore: null })
    expect(await again.flush()).toBe(true)
    // Clearing is sent as null on purpose. Leaving it out would mean "keep 60".
    expect(saves[0]!.body.upsert.components[0]).toHaveProperty('totalScore', null)
    expect((await stored()).components[0]).not.toHaveProperty('totalScore')
  })

  it('keeps a saved total when a draft left by version 1.6.0 is saved later', async () => {
    const a = await signUp()
    const e = await openApp(a)
    setGrades()
    expect(await e.flush()).toBe(true)
    // A 1.6.0 tab renamed the quiz and closed before saving. It never knew about totals.
    const before = (await stored()).revision ?? 1
    savePending({
      accountId: a.id,
      email: a.email,
      clientId: 'tab-v160',
      revision: before,
      changes: {
        upsert: { courses: [], sessions: [], tasks: [], notes: [], components: [{ id: 'quiz', courseId: 'c1', name: 'Quiz 1 renamed', weight: 30, score: 42 } as any] },
        remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
      },
    })
    e.stop()
    useSyncStore.setState(CLOSED)
    await openApp(a)
    expect((await stored()).components[0]).toEqual({ id: 'quiz', courseId: 'c1', name: 'Quiz 1 renamed', weight: 30, score: 42, totalScore: 50 })
    expect(useGradeStore.getState().components[0]).toMatchObject({ name: 'Quiz 1 renamed', totalScore: 50 })
  })

  it('keeps a custom total in a change that was not saved before a reload', async () => {
    const a = await signUp()
    const e = await openApp(a)
    useScheduleStore.setState({ courses: [COURSE], sessions: [] })
    await e.flush()
    network = () => Promise.reject(new TypeError('offline'))
    useGradeStore.setState({ components: [{ id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 }] })
    await e.save()
    e.keepNow()
    expect(listPending(a.id)[0]!.changes.upsert.components).toEqual([
      { id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 },
    ])
    e.stop()
    network = null
    useSyncStore.setState(CLOSED)
    useGradeStore.setState({ components: [] })
    await openApp(a)
    expect((await stored()).components).toEqual([{ id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 }])
  })

  it('keeps a guest\'s custom totals in this browser across a reload', async () => {
    setGrades()
    const text = localStorage.getItem('college-hub.grades')!
    expect(JSON.parse(text).state.components[0]).toMatchObject({ id: 'quiz', score: 42, totalScore: 50 })
    // A fresh page: memory is empty, and the browser still has what was saved.
    useGradeStore.setState({ components: [] })
    localStorage.setItem('college-hub.grades', text)
    await useGradeStore.persist.rehydrate()
    expect(useGradeStore.getState().components[0]).toMatchObject({ id: 'quiz', score: 42, totalScore: 50 })
  })
})
