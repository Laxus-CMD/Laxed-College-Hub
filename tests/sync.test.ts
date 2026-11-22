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
import { CLOSED, useSyncStore } from '@/sync/useSyncStore'

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
    expect(e.hasUnsaved()).toBe(true)
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

  it('warns before closing only while something is unsaved', async () => {
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
    addTask('unsaved')
    expect(leave()).toBe(true)
    network = null
    await e.flush()
    expect(leave()).toBe(false)
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
    expect(e.hasUnsaved()).toBe(true) // A's task is still held for A.
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
    useAuthStore.getState().accountDeleted()
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
