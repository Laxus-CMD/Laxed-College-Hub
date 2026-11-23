import { KINDS, isEmpty, type Changes } from '@/sync/doc'

/**
 * Changes a signed-in tab made that the server has not confirmed yet, kept in this
 * browser so a reload, a crash or an ended session does not lose them.
 *
 * - Only the difference is kept, never the whole account, and it is deleted as soon
 *   as the server confirms it.
 * - One entry per account and tab: `college-hub.pending.<accountId>.<clientId>`. Tabs
 *   never overwrite each other, and an entry is only ever sent to its own account.
 * - Each entry remembers the revision it was based on and the tab that made it, so
 *   sending it later is judged by the server exactly as the first try would have been.
 *   If that first try did reach the server, nothing is changed twice and no note is
 *   mistaken for an edit from another device.
 *
 * When the browser refuses to store it, the entry lives in memory for this tab only,
 * and `savePending` says so.
 */

export interface Pending {
  v: 1
  accountId: string
  /** Shown on the sign-in page, so the right person knows to sign in. */
  email: string
  /** The tab that made these changes. Sent as `clientId`. */
  clientId: string
  /** The account revision the changes were made on. Sent as `baseRevision`. */
  revision: number
  changes: Changes
  savedAt: string
}

/** Where unconfirmed changes are: nowhere, on this device, or only in this tab's memory. */
export type Where = 'device' | 'memory'

const PREFIX = 'college-hub.pending.'
const keyFor = (accountId: string, clientId: string) => `${PREFIX}${accountId}.${clientId}`

/** Entries the browser would not store. Lost on reload, which the save status says. */
const memory = new Map<string, Pending>()

function deviceKeys(): string[] {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    return keys
  } catch {
    return []
  }
}

const isList = (v: unknown) => Array.isArray(v) && v.every((r) => typeof r === 'object' && r !== null && typeof (r as { id?: unknown }).id === 'string')

/** Only well-formed entries come back. Anything else is ignored, not sent. */
function parse(text: string | null): Pending | null {
  if (!text) return null
  let p: Partial<Pending>
  try {
    p = JSON.parse(text) as Partial<Pending>
  } catch {
    return null
  }
  const c = p?.changes as Partial<Changes> | undefined
  const ok =
    p?.v === 1 &&
    typeof p.accountId === 'string' &&
    typeof p.clientId === 'string' &&
    typeof p.email === 'string' &&
    Number.isInteger(p.revision) &&
    p.revision! >= 0 &&
    typeof c?.upsert === 'object' &&
    typeof c?.remove === 'object' &&
    KINDS.every((k) => isList(c.upsert?.[k]) && Array.isArray(c.remove?.[k]) && c.remove[k].every((id) => typeof id === 'string')) &&
    (c.profile === undefined || (typeof c.profile === 'object' && c.profile !== null))
  return ok ? (p as Pending) : null
}

/** Keeps the latest unconfirmed changes for one tab. Says whether they will survive a reload. */
export function savePending(p: Omit<Pending, 'v' | 'savedAt'>): Where {
  const key = keyFor(p.accountId, p.clientId)
  const entry: Pending = { v: 1, ...p, savedAt: new Date().toISOString() }
  try {
    localStorage.setItem(key, JSON.stringify(entry))
    memory.delete(key)
    return 'device'
  } catch {
    memory.set(key, entry)
    // An older copy on the device would undo these changes if it were sent after a reload.
    try {
      localStorage.removeItem(key)
    } catch {
      /* Storage is off entirely, so nothing older can be read back either. */
    }
    return 'memory'
  }
}

export function dropPending(accountId: string, clientId: string): void {
  const key = keyFor(accountId, clientId)
  memory.delete(key)
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** Deletes every tab's unconfirmed changes for an account, on purpose. */
export function dropAllPending(accountId: string): void {
  for (const p of listPending(accountId)) dropPending(p.accountId, p.clientId)
}

/** Unconfirmed changes, oldest first. With an account, only that account's. */
export function listPending(accountId?: string): Pending[] {
  const found = new Map<string, Pending>()
  for (const key of deviceKeys()) {
    let text: string | null = null
    try {
      text = localStorage.getItem(key)
    } catch {
      /* ignore */
    }
    const p = parse(text)
    // The key must agree with the contents, so an entry cannot be filed under someone else.
    if (p && key === keyFor(p.accountId, p.clientId) && !isEmpty(p.changes)) found.set(key, p)
  }
  for (const [key, p] of memory) found.set(key, p)
  return [...found.values()]
    .filter((p) => accountId === undefined || p.accountId === accountId)
    .sort((a, b) => a.savedAt.localeCompare(b.savedAt))
}

/** True when some unconfirmed changes would be lost on reload. */
export const hasMemoryOnly = () => memory.size > 0

/** Forgets the in-memory fallback. For tests. */
export function resetPendingMemory(): void {
  memory.clear()
}
