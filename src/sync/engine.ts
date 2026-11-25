import { accountsApi, ApiError, request, type Account } from '@/features/auth/api'
import { API_FEATURES, type ApiFeature } from '@/types'
import { uid } from '@/lib/cn'
import { setDeviceStorage } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { apply, cleanDoc, diff, docsEqual, isEmpty, KINDS, readStores, writeStores, type Changes, type Doc, type DocProfile, type Kind } from '@/sync/doc'
import { dropAllPending, dropPending, dropPendingIfSame, hasMemoryOnly, listPending, savePending, type Pending } from '@/sync/pending'
import { CLOSED, useSyncStore, type LocalCopy } from '@/sync/useSyncStore'

/**
 * Keeps the app's stores and the student's account the same.
 *
 * Guests: the stores save to this browser, as always. This engine does nothing.
 * Accounts: the stores are filled from the server, and what changes is sent back
 * shortly after each edit. Until the server confirms a change, the difference is
 * also kept in this browser (see pending.ts), so a reload, a crash or an ended
 * session does not lose it. It is sent again the next time this account opens.
 *
 * `base` is what the server has, as far as this tab knows. Everything unsaved is
 * simply the difference between `base` and the stores, so nothing can be lost
 * track of and a retry always sends the latest.
 */

const SAVE_DELAY = 1000
/** Someone who types without pausing still gets saved this often. */
const MAX_DELAY = 5000
/** How soon an edit is written down in this browser. Short, so a crash loses at most this much. */
const KEEP_DELAY = 300
const RETRY_FIRST = 2000
const RETRY_MAX = 60_000
const TIMEOUT = 30_000
const RECHECK_AFTER = 30_000
/** Browsers refuse bigger requests while a page is closing. */
const KEEPALIVE_LIMIT = 60_000
/** Each open tab holds a lock with this prefix, so another tab can tell it is still alive. */
const TAB_LOCK = 'college-hub.tab.'

const STORES = [useScheduleStore, useTaskStore, useNoteStore, useGradeStore, useSettingsStore] as const

interface ServerDoc extends Doc {
  revision: number
}
interface LoadResponse {
  accountId: string
  revision: number
  data: ServerDoc | null
  /** Missing from an API before 1.10.0. */
  features?: unknown
}

/**
 * A request body without what the account's API has not said it can store. An older API would
 * refuse a profile field (blocking every save) or drop a task field. Only the request is trimmed:
 * the engine still counts the whole change as sent, so it is not resent forever.
 */
function forApi(changes: Changes): Changes {
  const { features } = useSyncStore.getState()
  let out = changes
  if (!features.includes('taskMode') && out.profile && 'taskMode' in out.profile) {
    const { taskMode: _t, ...profile } = out.profile
    out = { ...out, profile: Object.keys(profile).length ? profile : undefined }
  }
  if (!features.includes('progress') && out.upsert.tasks.some((t) => 'progress' in t)) {
    out = { ...out, upsert: { ...out.upsert, tasks: out.upsert.tasks.map(({ progress: _p, ...t }) => t) } }
  }
  return out
}

/** What the API says it can store, keeping only what this app knows about. */
const featuresOf = (res: LoadResponse): ApiFeature[] =>
  Array.isArray(res.features) ? API_FEATURES.filter((f) => (res.features as unknown[]).includes(f)) : []
interface SaveResponse {
  revision: number
  data: ServerDoc | null
  noteCopies: Record<string, string>
}

interface Open {
  account: Account
  base: Doc
  revision: number
}

const isStatus = (err: unknown, ...statuses: number[]) => err instanceof ApiError && statuses.includes(err.status)

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(0, 'The server took too long to answer.')), TIMEOUT)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}

const newClientId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uid('tab').padEnd(8, '0'))

interface LockManagerLike {
  request(name: string, callback: () => Promise<void>): Promise<void>
  query(): Promise<{ held?: { name?: string }[] }>
}
const locks = (): LockManagerLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { locks?: LockManagerLike }).locks

/** Tabs that are open right now. Empty when the browser cannot tell, and then every entry counts as left behind. */
async function liveTabs(): Promise<Set<string>> {
  try {
    const { held = [] } = (await locks()?.query()) ?? {}
    return new Set(held.map((l) => l.name ?? '').filter((n) => n.startsWith(TAB_LOCK)).map((n) => n.slice(TAB_LOCK.length)))
  } catch {
    return new Set()
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Leaves out what the server already has. When a save reached the server but its answer
 * never came back, sending it again then changes nothing.
 */
export function notYetApplied(changes: Changes, server: Doc): Changes {
  const out: Changes = {
    upsert: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
    remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
  }
  for (const kind of KINDS) {
    const byId = new Map<string, object>(server[kind].map((r) => [r.id, r]))
    ;(out.upsert as Record<Kind, object[]>)[kind] = (changes.upsert[kind] as { id: string; body?: string }[]).filter((r) => {
      const now = byId.get(r.id) as Record<string, unknown> | undefined
      if (!now) return true
      if (kind === 'notes' && r.body === undefined) {
        const { title: _t, body: _b, ...links } = now
        return !same(links, r)
      }
      return !same(now, r)
    })
    out.remove[kind] = changes.remove[kind].filter((id) => byId.has(id))
  }
  const profile = Object.fromEntries(
    Object.entries(changes.profile ?? {}).filter(([k, v]) => !same(server.profile[k as keyof DocProfile], v)),
  )
  if (Object.keys(profile).length) out.profile = profile
  return out
}

export class SyncEngine {
  /** Tells the server which tab a save came from, so a retry is not mistaken for another device. */
  private readonly clientId = newClientId()
  private open_: Open | null = null
  /** Goes up on every sign-in and sign-out, so late answers for an earlier account are ignored. */
  private epoch = 0
  private applying = false
  private saving: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private keepTimer: ReturnType<typeof setTimeout> | undefined
  private firstUnsavedAt = 0
  private retryDelay = 0
  private lastChecked = 0
  private started = false
  private readonly stops: (() => void)[] = []

  /** Starts watching the stores and the page. Safe to call more than once. */
  start(): void {
    if (this.started) return
    this.started = true
    this.holdTabLock()
    for (const store of STORES) this.stops.push(store.subscribe(() => this.onChange()))
    const follow = (account: Account | null) => (account ? void this.open(account) : this.close())
    this.stops.push(
      useAuthStore.subscribe((s, prev) => {
        if (s.account !== prev.account) follow(s.account)
      }),
    )
    const on = (target: EventTarget, type: string, fn: (e: Event) => void) => {
      target.addEventListener(type, fn)
      this.stops.push(() => target.removeEventListener(type, fn))
    }
    on(window, 'online', () => void this.retryNow())
    on(window, 'focus', () => void this.recheck())
    on(window, 'pagehide', () => {
      this.keepNow()
      void this.save({ closing: true })
    })
    on(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.keepNow()
        void this.save({ closing: true })
      } else void this.recheck()
    })
    on(window, 'beforeunload', (e) => {
      this.keepNow()
      if (!this.hasUnsaved()) return
      void this.save({ closing: true })
      // Kept in this browser, so it is saved next time. Only ask when it would be lost.
      if (useSyncStore.getState().local === 'device' && !hasMemoryOnly()) return
      e.preventDefault()
    })
    // Another tab signed in, out, or to someone else. All tabs share one session cookie.
    on(window, 'storage', (e) => {
      if ((e as StorageEvent).key === useAuthStore.persist.getOptions().name) void useAuthStore.persist.rehydrate()
    })
    useSyncStore.setState({ heldFor: this.heldFor(useSyncStore.getState().accountId) })
    follow(useAuthStore.getState().account)
  }

  /**
   * Stops watching without saving or writing anything down, like a tab that is closed
   * or crashes. For tests and hot reload.
   */
  stop(): void {
    while (this.stops.length) this.stops.pop()!()
    clearTimeout(this.timer)
    clearTimeout(this.keepTimer)
    this.epoch++
    this.open_ = null
    this.saving = null
    this.started = false
  }

  hasUnsaved(): boolean {
    if (hasMemoryOnly()) return true
    return this.open_ !== null && (this.saving !== null || !docsEqual(this.open_.base, readStores()))
  }

  // --- Signing in and out ---------------------------------------------------

  /** Shows this account's data, loading it first, and saves what an earlier visit left unsaved. */
  async open(account: Account): Promise<void> {
    const sync = useSyncStore.getState()
    if (sync.accountId === account.id && sync.phase !== 'load-error') {
      if (this.open_) this.open_.account = account
      return
    }
    this.leave()
    const epoch = ++this.epoch
    setDeviceStorage(false)
    useSyncStore.setState({
      accountId: account.id,
      phase: 'loading',
      status: 'saved',
      local: 'none',
      message: null,
      heldFor: this.heldFor(account.id),
      features: [],
    })

    try {
      const res = await withTimeout(request<LoadResponse>('GET', '/data'))
      if (epoch !== this.epoch) return
      if (res.accountId !== account.id || !res.data) return await this.followSession(epoch)
      const open: Open = { account, base: this.fromServer(res.data), revision: res.revision }
      // Before the stores fill, so the page never shows a mode this API cannot keep.
      useSyncStore.setState({ features: featuresOf(res) })
      const { saved, refused } = await this.recover(open, epoch)
      if (epoch !== this.epoch) return
      this.open_ = open
      this.lastChecked = Date.now()
      // What the account cannot take stays on screen, so the student can see it and fix it.
      this.fillStores(refused.reduce((doc, r) => apply(doc, r.changes), open.base))
      useSyncStore.setState({ phase: 'ready' })
      // Written down under this tab before the old entries go, so a crash in between loses nothing.
      this.settled()
      // Only once that copy is really on the device. If the browser refused it, the old entries
      // are the only copy that survives a reload, so they stay.
      if (useSyncStore.getState().local !== 'memory') {
        for (const { entry } of refused) if (entry.clientId !== this.clientId) dropPendingIfSame(entry)
      }
      if (refused.length) void this.save()
      if (res.revision === 0) useSettingsStore.getState().setName(account.name.split(' ')[0]!.slice(0, 30))
      if (saved) useUiStore.getState().showToast({ message: 'Changes from your last visit were saved to your account.' })
    } catch (err) {
      if (epoch !== this.epoch) return
      if (isStatus(err, 401)) return useAuthStore.getState().sessionEnded()
      if (isStatus(err, 409)) return await this.followSession(epoch)
      useSyncStore.setState({ phase: 'load-error', message: err instanceof Error ? err.message : 'Something went wrong.' })
    }
  }

  /**
   * Sends changes that earlier visits kept in this browser, oldest first, each as the tab
   * that made it. Entries from tabs that are still open are left to them.
   * Throws when the server cannot be reached, and then every entry stays for next time.
   */
  private async recover(open: Open, epoch: number): Promise<{ saved: number; refused: { entry: Pending; changes: Changes }[] }> {
    const live = await liveTabs()
    let saved = 0
    const refused: { entry: Pending; changes: Changes }[] = []
    for (const p of listPending(open.account.id)) {
      if (p.clientId !== this.clientId && live.has(p.clientId)) continue
      const changes = notYetApplied(p.changes, open.base)
      // From here on, only this exact entry may be deleted. Anything written under the same key
      // while a request is out, for example by the tab that made it, is newer and stays.
      if (isEmpty(changes)) {
        dropPendingIfSame(p)
        continue
      }
      try {
        const body = { accountId: p.accountId, clientId: p.clientId, baseRevision: p.revision, ...forApi(changes) }
        const res = await withTimeout(request<SaveResponse>('POST', '/data/sync', body))
        if (epoch !== this.epoch) return { saved, refused }
        open.base = res.data ? this.fromServer(res.data) : apply(open.base, changes)
        open.revision = res.revision
        dropPendingIfSame(p)
        saved++
      } catch (err) {
        // Sending it again would not help. Show it instead, so the student can make room or fix it.
        if (isStatus(err, 400, 413, 422)) refused.push({ entry: p, changes })
        else throw err
      }
    }
    return { saved, refused }
  }

  /** Signed out. Takes the account's data out of the app and brings back what a guest saved in this browser. */
  close(): void {
    if (useSyncStore.getState().accountId === null) return
    this.leave()
    this.epoch++
    this.quietly(() => {
      for (const store of STORES) (store.setState as (s: unknown) => void)(store.getInitialState())
      setDeviceStorage(true)
      for (const store of STORES) void store.persist.rehydrate()
    })
    useSyncStore.setState({ ...CLOSED, heldFor: this.heldFor(null) })
  }

  /**
   * Deletes the open account's unsaved changes from this tab and this browser, on purpose:
   * the student chose to sign out anyway, or deleted the account.
   */
  discard(): void {
    clearTimeout(this.timer)
    clearTimeout(this.keepTimer)
    if (this.open_) dropAllPending(this.open_.account.id)
    this.open_ = null
    this.epoch++
    useSyncStore.setState({ local: 'none', heldFor: this.heldFor(useSyncStore.getState().accountId) })
  }

  /** Deletes changes kept in this browser for an account that is not open. For shared computers. */
  forget(accountId: string): void {
    if (this.open_?.account.id === accountId) return
    dropAllPending(accountId)
    useSyncStore.setState({ heldFor: this.heldFor(useSyncStore.getState().accountId) })
  }

  /** Stops syncing the open account. Anything unsaved stays in this browser for next time. */
  private leave(): void {
    clearTimeout(this.timer)
    this.keepNow()
    this.open_ = null
    this.saving = null
    this.retryDelay = 0
    this.firstUnsavedAt = 0
    // Undo, open dialogs and selections belong to the data that is leaving.
    useUiStore.setState({ dialog: null, drawerSessionId: null, taskCourse: '', selectedNoteId: null, flashTaskId: null, toast: null })
  }

  /** The session cookie belongs to someone else now. Show that account instead. */
  private async followSession(epoch: number): Promise<void> {
    try {
      const account = await accountsApi.me()
      if (epoch !== this.epoch) return
      if (account.id === useSyncStore.getState().accountId) throw new Error('The session changed back meanwhile.')
      useAuthStore.getState().signInAccount(account)
    } catch (err) {
      if (epoch !== this.epoch) return
      if (isStatus(err, 401)) useAuthStore.getState().sessionEnded()
      else if (!this.open_) useSyncStore.setState({ phase: 'load-error', message: 'You signed in to another account in this browser.' })
    }
  }

  // --- Keeping unsaved changes in this browser ------------------------------

  /** Writes down what the server has not confirmed yet, or deletes the entry when that is nothing. */
  keepNow(): void {
    clearTimeout(this.keepTimer)
    const open = this.open_
    if (!open) return
    const changes = diff(open.base, readStores())
    let local: LocalCopy = 'none'
    if (isEmpty(changes)) dropPending(open.account.id, this.clientId)
    else {
      local = savePending({ accountId: open.account.id, email: open.account.email, clientId: this.clientId, revision: open.revision, changes })
    }
    if (useSyncStore.getState().local !== local) useSyncStore.setState({ local })
  }

  private holdTabLock(): void {
    let release = () => {}
    locks()
      ?.request(TAB_LOCK + this.clientId, () => new Promise<void>((resolve) => (release = resolve)))
      .catch(() => {})
    this.stops.push(() => release())
  }

  // --- Saving ---------------------------------------------------------------

  private onChange(): void {
    if (this.applying || !this.open_) return
    clearTimeout(this.keepTimer)
    this.keepTimer = setTimeout(() => this.keepNow(), KEEP_DELAY)
    const now = Date.now()
    this.firstUnsavedAt ||= now
    // After a failure, wait for the retry that is already scheduled.
    if (this.retryDelay) return
    useSyncStore.setState({ status: 'unsaved', message: null })
    this.schedule(Math.max(0, Math.min(SAVE_DELAY, this.firstUnsavedAt + MAX_DELAY - now)))
  }

  private schedule(delay: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.save(), delay)
  }

  /** Saves now and waits. True when everything is safely on the server. */
  async flush(): Promise<boolean> {
    const open = this.open_
    if (!open) return false
    // A save that was already on its way may not have the latest edits, so go around once more.
    for (let i = 0; i < 2 && this.open_ === open; i++) await this.save()
    // If the session ended meanwhile, nothing was confirmed.
    return this.open_ === open && this.saving === null && docsEqual(open.base, readStores())
  }

  /**
   * Adds an import, all or nothing. If the account cannot take it, for example because it
   * would be full, everything goes back to how it was.
   */
  async addAll(doc: Doc): Promise<'saved' | 'pending' | { error: string }> {
    // Anything unsaved goes first, so a refusal is about the import alone.
    if (!(await this.flush()) || !this.open_) return { error: 'Your latest changes are not saved yet. Try again once they are.' }
    const before = readStores()
    const epoch = this.epoch
    this.fillStores(doc)
    useSyncStore.setState({ status: 'unsaved' })
    this.keepNow()
    if (await this.flush()) return 'saved'
    const { status, message } = useSyncStore.getState()
    if (epoch !== this.epoch || status !== 'blocked') return 'pending'
    this.fillStores(before)
    this.settled()
    return { error: message ?? 'Your account could not take this.' }
  }

  retryNow(): Promise<void> {
    this.retryDelay = 0
    return this.save()
  }

  /** One save at a time. Does nothing when there is nothing to save. */
  async save({ closing = false } = {}): Promise<void> {
    if (this.saving) return this.saving
    if (!this.open_) return
    clearTimeout(this.timer)
    const open = this.open_
    const sent = readStores()
    const changes = diff(open.base, sent)
    if (isEmpty(changes)) {
      this.settled()
      return
    }
    const run = this.send(open, sent, changes, closing).finally(() => {
      if (this.saving === run) this.saving = null
      // Edits made while that was on its way.
      if (this.open_ === open && useSyncStore.getState().status === 'unsaved') this.schedule(SAVE_DELAY)
    })
    this.saving = run
    return run
  }

  private async send(open: Open, sent: Doc, changes: Changes, closing: boolean): Promise<void> {
    const epoch = this.epoch
    const body = { accountId: open.account.id, clientId: this.clientId, baseRevision: open.revision, ...forApi(changes) }
    const keepalive = closing && JSON.stringify(body).length < KEEPALIVE_LIMIT
    if (!this.retryDelay) useSyncStore.setState({ status: 'saving', message: null })
    this.firstUnsavedAt = 0
    try {
      const res = await withTimeout(request<SaveResponse>('POST', '/data/sync', body, { keepalive }))
      if (epoch !== this.epoch) return
      this.retryDelay = 0
      this.lastChecked = Date.now()
      if (res.data) this.rebase(open, sent, res.data, res.noteCopies)
      else open.base = sent
      open.revision = res.revision
      this.settled()
    } catch (err) {
      if (epoch !== this.epoch) return
      this.failed(err)
    }
  }

  private settled(): void {
    const clean = this.open_ !== null && docsEqual(this.open_.base, readStores())
    if (clean) this.firstUnsavedAt = 0
    this.keepNow()
    useSyncStore.setState({ status: clean ? 'saved' : 'unsaved', message: null })
  }

  private failed(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    this.keepNow()
    if (isStatus(err, 401)) {
      // `close` follows, and the unsaved changes stay in this browser until they sign in again.
      useAuthStore.getState().sessionEnded()
      return
    }
    if (isStatus(err, 409)) {
      // Nothing was saved. Usually this switches accounts; if not, the retry below sorts it out.
      void this.followSession(this.epoch)
    }
    if (isStatus(err, 400, 413, 422)) {
      // Trying the same thing again would not help. The next edit tries again.
      this.retryDelay = 0
      useSyncStore.setState({ status: 'blocked', message: isStatus(err, 422) ? message : 'Your latest changes could not be saved.' })
      return
    }
    this.retryDelay = Math.min(RETRY_MAX, this.retryDelay ? this.retryDelay * 2 : RETRY_FIRST)
    useSyncStore.setState({ status: 'retrying', message })
    this.schedule(this.retryDelay)
  }

  // --- Changes from other devices -------------------------------------------

  /** Looks for changes from other devices, when the student comes back to this tab. */
  async recheck(): Promise<void> {
    const open = this.open_
    if (!open || this.saving || Date.now() - this.lastChecked < RECHECK_AFTER) return
    // Unsaved edits: saving also brings back what changed elsewhere.
    if (!docsEqual(open.base, readStores())) return this.save()
    const epoch = this.epoch
    const { base, revision } = open
    this.lastChecked = Date.now()
    try {
      const res = await withTimeout(request<LoadResponse>('GET', `/data?since=${revision}`))
      // A save that finished meanwhile knows more than this answer.
      if (epoch !== this.epoch || this.saving || open.revision !== revision) return
      if (res.accountId !== open.account.id) return await this.followSession(epoch)
      // The API can be upgraded (or rolled back) while the tab stays open.
      const features = featuresOf(res)
      if (features.join() !== useSyncStore.getState().features.join()) useSyncStore.setState({ features })
      if (!res.data) return
      this.rebase(open, base, res.data)
      open.revision = res.revision
      this.settled()
      if (useSyncStore.getState().status === 'unsaved') this.schedule(SAVE_DELAY)
    } catch (err) {
      if (epoch === this.epoch && isStatus(err, 401)) useAuthStore.getState().sessionEnded()
    }
  }

  /** Takes the server's version, and puts edits made since `sent` back on top. */
  private rebase(open: Open, sent: Doc, data: ServerDoc, noteCopies: Record<string, string> = {}): void {
    const now = readStores()
    const server = this.fromServer(data)
    const next = apply(server, diff(sent, now), noteCopies)
    open.base = server
    if (!docsEqual(now, next)) {
      this.fillStores(next)
      const ui = useUiStore.getState()
      // Undo would bring back the whole old state, without what just came in.
      if (ui.toast?.undo) ui.hideToast()
      const copy = ui.selectedNoteId ? noteCopies[ui.selectedNoteId] : undefined
      if (copy) ui.selectNote(copy)
    }
    if (Object.keys(noteCopies).length) {
      useUiStore.getState().showToast({ message: 'A note was also edited on another device. Both versions were kept.' })
    }
  }

  // --- Helpers --------------------------------------------------------------

  private fromServer({ revision: _r, ...doc }: ServerDoc): Doc {
    return cleanDoc(doc)
  }

  private fillStores(doc: Doc): void {
    this.quietly(() => writeStores(doc))
  }

  /** Someone other than `openId` with changes waiting in this browser. */
  private heldFor(openId: string | null): string | null {
    return listPending().find((p) => p.accountId !== openId)?.email ?? null
  }

  /** Changes the stores without counting it as an edit. */
  private quietly(fn: () => void): void {
    this.applying = true
    try {
      fn()
    } finally {
      this.applying = false
    }
  }
}

export const sync = new SyncEngine()
