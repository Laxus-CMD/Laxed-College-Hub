import { useMemo, useSyncExternalStore } from 'react'
import { deviceKeys, readDevice, removeDevice, writeDevice } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * The last study session, so the Overview can offer to pick up where it left off.
 * Kept in this browser, per person: each account has its own, and guests share theirs, like
 * the rest of what a guest saves here. An account's sessions hold what its owner typed, so
 * they leave this browser when the account signs out or its session ends, the same way the
 * account's other data does.
 *
 * Several tabs may report sessions at the same moment, and storage has no transactions. So
 * nothing here is read, changed and written back: each session is its own record, named by
 * when it ended, and the newest record is the last session. A late write from an older
 * session lands in its own record and can never replace a newer one. Its task, if a tab had
 * one, is a separate record that only a tab with a task writes, so a tab with nothing typed
 * can never erase it.
 */
export interface StudySession {
  /** The Focus Space task at the time, if one was typed. */
  task: string | null
  /** When the session ended: the moment a focus interval reached zero, or was reset. */
  endedAt: number
  /** How long was spent focusing. */
  focusMs: number
}

const PREFIX = 'college-hub.study.'
const CHANGED = 'college-hub:study'
const scopeOf = (s: { account: { id: string } | null }) => s.account?.id ?? 'guest'
const prefixOf = (scope: string) => `${PREFIX}${scope}.`
const sessionKey = (scope: string, endedAt: number) => `${prefixOf(scope)}s.${endedAt}`
const taskKey = (scope: string, endedAt: number) => `${prefixOf(scope)}t.${endedAt}`
/** When a stored record's session ended, from its name. */
const endedAtOf = (key: string, scope: string): number | null => {
  const m = /^[st]\.(\d{1,16})$/.exec(key.slice(prefixOf(scope).length))
  return m ? Number(m[1]) : null
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const cleanTask = (task: unknown): string | null => (typeof task === 'string' && task.trim() ? task.trim().slice(0, 160) : null)

function parse(raw: string | null): Record<string, unknown> | null {
  try {
    const s = JSON.parse(raw ?? 'null') as Record<string, unknown> | null
    return s && typeof s === 'object' && s.v === 1 ? s : null
  } catch {
    return null
  }
}

/** Every key this browser keeps for one person's study log. */
export const studyKeys = (scope: string): string[] => deviceKeys(prefixOf(scope))

/** The newest session kept for `scope`, with the task any tab reported for it. */
export function readSessionOf(scope: string): StudySession | null {
  let best: StudySession | null = null
  for (const key of studyKeys(scope)) {
    const endedAt = endedAtOf(key, scope)
    if (endedAt === null || !key.startsWith(`${prefixOf(scope)}s.`) || (best && best.endedAt >= endedAt)) continue
    const record = parse(readDevice(key))
    if (!record || !finite(record.focusMs) || !finite(endedAt)) continue
    best = { task: null, endedAt, focusMs: Math.min(record.focusMs, 24 * 3_600_000) }
  }
  if (best) best.task = cleanTask(parse(readDevice(taskKey(scope, best.endedAt)))?.task)
  return best
}

/** Who is using the app now: an account id, or "guest" (also while signed out). */
export const studyScope = (): string => scopeOf(useAuthStore.getState())

/** The last session for whoever is using the app now. */
export const readLastSession = (): StudySession | null => readSessionOf(studyScope())

/**
 * Notes a finished session for `owner`, the person who started the timer. Kept only while
 * that person is still the one using the app: a session that ends after they signed out is
 * not handed to whoever came next, and not left behind for them either.
 *
 * Safe from any number of tabs, in any order, even at the same moment (see the top of this file).
 */
export function recordSession(owner: string | undefined, session: StudySession): void {
  if (!owner || owner !== studyScope()) return
  if (!finite(session.endedAt) || !Number.isInteger(session.endedAt) || !(session.focusMs >= 60_000)) return
  const { endedAt } = session
  writeDevice(sessionKey(owner, endedAt), JSON.stringify({ v: 1, focusMs: Math.round(session.focusMs) }))
  const task = cleanTask(session.task)
  if (task) writeDevice(taskKey(owner, endedAt), JSON.stringify({ v: 1, task }))
  // Only the last session is shown. Older records go; newer ones, from any tab, stay.
  for (const key of studyKeys(owner)) {
    const at = endedAtOf(key, owner)
    if (at === null || at < endedAt) removeDevice(key)
  }
  window.dispatchEvent(new Event(CHANGED))
}

/** Removes everything this browser keeps for one person's study log. */
export function clearStudyLog(scope: string): void {
  for (const key of studyKeys(scope)) removeDevice(key)
  window.dispatchEvent(new Event(CHANGED))
}

// An account signing out, or losing its session, takes its study log off this browser.
useAuthStore.subscribe((now, before) => {
  if (before.account && now.account?.id !== before.account.id) clearStudyLog(before.account.id)
})

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) onChange()
  }
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** The last session for whoever is using the app, kept up to date. */
export function useLastSession(): StudySession | null {
  const scope = useAuthStore(scopeOf)
  // As a string, so the snapshot only changes when the session does.
  const raw = useSyncExternalStore(subscribe, () => JSON.stringify(readSessionOf(scope)))
  return useMemo(() => JSON.parse(raw) as StudySession | null, [raw])
}
