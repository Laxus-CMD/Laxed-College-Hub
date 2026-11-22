import { accountsApi, ApiError, request, type Account } from '@/features/auth/api'
import { uid } from '@/lib/cn'
import { setDeviceStorage } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { apply, cleanDoc, diff, docsEqual, isEmpty, readStores, writeStores, type Changes, type Doc } from '@/sync/doc'
import { CLOSED, useSyncStore } from '@/sync/useSyncStore'

/**
 * Keeps the app's stores and the student's account the same.
 *
 * Guests: the stores save to this browser, as always. This engine does nothing.
 * Accounts: the stores live in memory only. They are filled from the server,
 * and what changes is sent back shortly after each edit.
 *
 * `base` is what the server has, as far as this tab knows. Everything unsaved is
 * simply the difference between `base` and the stores, so nothing can be lost
 * track of and a retry always sends the latest.
 */

const SAVE_DELAY = 1000
/** Someone who types without pausing still gets saved this often. */
const MAX_DELAY = 5000
const RETRY_FIRST = 2000
const RETRY_MAX = 60_000
const TIMEOUT = 30_000
const RECHECK_AFTER = 30_000
/** Browsers refuse bigger requests while a page is closing. */
const KEEPALIVE_LIMIT = 60_000

const STORES = [useScheduleStore, useTaskStore, useNoteStore, useGradeStore, useSettingsStore] as const

interface ServerDoc extends Doc {
  revision: number
}
interface LoadResponse {
  accountId: string
  revision: number
  data: ServerDoc | null
}
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

export class SyncEngine {
  /** Tells the server which tab a save came from, so a retry is not mistaken for another device. */
  private readonly clientId = newClientId()
  private open_: Open | null = null
  /** Changes whose session ended before they were saved. Kept for when the same person signs in again. */
  private readonly held = new Map<string, Open & { doc: Doc }>()
  /** Goes up on every sign-in and sign-out, so late answers for an earlier account are ignored. */
  private epoch = 0
  private applying = false
  private saving: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private firstUnsavedAt = 0
  private retryDelay = 0
  private lastChecked = 0
  private started = false

  /** Starts watching the stores and the page. Safe to call more than once. */
  start(): void {
    if (this.started) return
    this.started = true
    for (const store of STORES) store.subscribe(() => this.onChange())
    const follow = (account: Account | null) => (account ? void this.open(account) : this.close())
    useAuthStore.subscribe((s, prev) => {
      if (s.account !== prev.account) follow(s.account)
    })
    follow(useAuthStore.getState().account)
    window.addEventListener('online', () => void this.retryNow())
    window.addEventListener('focus', () => void this.recheck())
    window.addEventListener('pagehide', () => void this.save({ closing: true }))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.save({ closing: true })
      else void this.recheck()
    })
    window.addEventListener('beforeunload', (e) => {
      if (!this.hasUnsaved()) return
      void this.save({ closing: true })
      e.preventDefault()
    })
    // Another tab signed in, out, or to someone else. All tabs share one session cookie.
    window.addEventListener('storage', (e) => {
      if (e.key === useAuthStore.persist.getOptions().name) void useAuthStore.persist.rehydrate()
    })
  }

  hasUnsaved(): boolean {
    if (this.held.size) return true
    return this.open_ !== null && (this.saving !== null || !docsEqual(this.open_.base, readStores()))
  }

  // --- Signing in and out ---------------------------------------------------

  /** Shows this account's data, loading it first. */
  async open(account: Account): Promise<void> {
    const sync = useSyncStore.getState()
    if (sync.accountId === account.id && sync.phase !== 'load-error') {
      if (this.open_) this.open_.account = account
      return
    }
    this.leave()
    const epoch = ++this.epoch
    setDeviceStorage(false)
    useSyncStore.setState({ accountId: account.id, phase: 'loading', status: 'saved', message: null })

    const held = this.held.get(account.id)
    if (held) {
      // Carry on from where the last session ended. The server merges and answers with everything.
      this.held.delete(account.id)
      this.open_ = { account, base: held.base, revision: held.revision }
      this.fillStores(held.doc)
      useSyncStore.setState({ phase: 'ready', heldFor: this.heldFor() })
      await this.save()
      return
    }

    try {
      const res = await withTimeout(request<LoadResponse>('GET', '/data'))
      if (epoch !== this.epoch) return
      if (res.accountId !== account.id || !res.data) return await this.followSession(epoch)
      const base = this.fromServer(res.data)
      this.open_ = { account, base, revision: res.revision }
      this.lastChecked = Date.now()
      this.fillStores(base)
      useSyncStore.setState({ phase: 'ready' })
      if (res.revision === 0) useSettingsStore.getState().setName(account.name.split(' ')[0]!.slice(0, 30))
    } catch (err) {
      if (epoch !== this.epoch) return
      if (isStatus(err, 401)) return useAuthStore.getState().sessionEnded()
      useSyncStore.setState({ phase: 'load-error', message: err instanceof Error ? err.message : 'Something went wrong.' })
    }
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
    useSyncStore.setState({ ...CLOSED, heldFor: this.heldFor() })
  }

  /** Drops unsaved changes on purpose: the student chose to sign out anyway, or deleted the account. */
  discard(): void {
    clearTimeout(this.timer)
    if (this.open_) this.held.delete(this.open_.account.id)
    this.open_ = null
    this.epoch++
    useSyncStore.setState({ heldFor: this.heldFor() })
  }

  /** Stops syncing the open account, and keeps anything unsaved in memory. */
  private leave(): void {
    clearTimeout(this.timer)
    if (this.open_) {
      const doc = readStores()
      if (!docsEqual(this.open_.base, doc)) {
        this.held.set(this.open_.account.id, { ...this.open_, doc })
        useSyncStore.setState({ heldFor: this.heldFor() })
      }
    }
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

  // --- Saving ---------------------------------------------------------------

  private onChange(): void {
    if (this.applying || !this.open_) return
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
    // A save that was already on its way may not have the latest edits, so go around once more.
    for (let i = 0; i < 2 && this.open_; i++) await this.save()
    return !this.hasUnsaved()
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
    const body = { accountId: open.account.id, clientId: this.clientId, baseRevision: open.revision, ...changes }
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
    useSyncStore.setState({ status: clean ? 'saved' : 'unsaved', message: null })
  }

  private failed(err: unknown): void {
    const message = err instanceof Error ? err.message : 'Something went wrong.'
    if (isStatus(err, 401)) {
      // `close` follows and keeps the unsaved changes until they sign in again.
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

  private heldFor(): string | null {
    return [...this.held.values()][0]?.account.email ?? null
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
