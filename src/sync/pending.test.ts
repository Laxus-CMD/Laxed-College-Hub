import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Changes } from '@/sync/doc'
import { dropAllPending, dropPending, dropPendingIfSame, hasMemoryOnly, listPending, resetPendingMemory, savePending } from '@/sync/pending'

const NONE = { courses: [], sessions: [], tasks: [], notes: [], components: [] }
const task = (title: string): Changes => ({
  upsert: { ...NONE, tasks: [{ id: 't1', kind: 'todo', title, done: false, source: 'manual' }] },
  remove: { ...NONE },
})
const entry = (accountId: string, clientId: string, title = 'Essay') => ({
  accountId,
  email: `${accountId}@example.com`,
  clientId,
  revision: 3,
  changes: task(title),
})

beforeEach(() => {
  localStorage.clear()
  resetPendingMemory()
})
afterEach(() => vi.restoreAllMocks())

describe('pending changes', () => {
  it('keeps one entry per account and tab, and lists them by account', () => {
    expect(savePending(entry('acc-a', 'tab-1'))).toBe('device')
    savePending(entry('acc-a', 'tab-2'))
    savePending(entry('acc-b', 'tab-1'))
    expect(listPending('acc-a').map((p) => p.clientId).sort()).toEqual(['tab-1', 'tab-2'])
    expect(listPending('acc-b')).toHaveLength(1)
    expect(listPending()).toHaveLength(3)
  })

  it('replaces a tab\'s entry instead of piling up', () => {
    savePending(entry('acc-a', 'tab-1', 'first'))
    savePending(entry('acc-a', 'tab-1', 'second'))
    expect(listPending('acc-a').map((p) => p.changes.upsert.tasks[0]!.title)).toEqual(['second'])
  })

  it('drops one tab, or every tab of an account', () => {
    savePending(entry('acc-a', 'tab-1'))
    savePending(entry('acc-a', 'tab-2'))
    savePending(entry('acc-b', 'tab-1'))
    dropPending('acc-a', 'tab-1')
    expect(listPending('acc-a').map((p) => p.clientId)).toEqual(['tab-2'])
    dropAllPending('acc-a')
    expect(listPending().map((p) => p.accountId)).toEqual(['acc-b'])
  })

  it('ignores entries that are broken, empty, or filed under another account', () => {
    localStorage.setItem('college-hub.pending.acc-a.tab-1', '{not json')
    localStorage.setItem('college-hub.pending.acc-a.tab-2', JSON.stringify({ v: 1, accountId: 'acc-a', clientId: 'tab-2' }))
    // Says it is for acc-b, but is stored under acc-a: never trusted.
    localStorage.setItem(
      'college-hub.pending.acc-a.tab-3',
      JSON.stringify({ v: 1, ...entry('acc-b', 'tab-3'), savedAt: '2026-11-23T00:00:00.000Z' }),
    )
    localStorage.setItem(
      'college-hub.pending.acc-a.tab-4',
      JSON.stringify({ v: 1, ...entry('acc-a', 'tab-4'), changes: { upsert: NONE, remove: NONE }, savedAt: '2026-11-23T00:00:00.000Z' }),
    )
    localStorage.setItem(
      'college-hub.pending.acc-a.tab-5',
      JSON.stringify({ v: 1, ...entry('acc-a', 'tab-5'), revision: -1, savedAt: '2026-11-23T00:00:00.000Z' }),
    )
    expect(listPending()).toEqual([])
  })

  it('falls back to this tab\'s memory when the browser refuses, and keeps the last copy it accepted', () => {
    savePending(entry('acc-a', 'tab-1', 'older'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(savePending(entry('acc-a', 'tab-1', 'newer'))).toBe('memory')
    expect(hasMemoryOnly()).toBe(true)
    // This page sees the newer changes. A fresh page still finds the older ones.
    expect(listPending('acc-a').map((p) => p.changes.upsert.tasks[0]!.title)).toEqual(['newer'])
    expect(localStorage.getItem('college-hub.pending.acc-a.tab-1')).toMatch(/"older"/)
    resetPendingMemory()
    expect(listPending('acc-a').map((p) => p.changes.upsert.tasks[0]!.title)).toEqual(['older'])
  })

  it('moves back to the device once the browser takes it again', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(savePending(entry('acc-a', 'tab-1', 'newer'))).toBe('memory')
    expect(savePending(entry('acc-a', 'tab-1', 'newest'))).toBe('device')
    expect(hasMemoryOnly()).toBe(false)
    expect(listPending('acc-a').map((p) => p.changes.upsert.tasks[0]!.title)).toEqual(['newest'])
  })

  it('deletes an entry only if it is still the one that was sent', () => {
    savePending(entry('acc-a', 'tab-1', 'sent'))
    const sent = listPending('acc-a')[0]!
    savePending(entry('acc-a', 'tab-1', 'written meanwhile'))
    dropPendingIfSame(sent)
    expect(listPending('acc-a').map((p) => p.changes.upsert.tasks[0]!.title)).toEqual(['written meanwhile'])
    dropPendingIfSame(listPending('acc-a')[0]!)
    expect(listPending()).toEqual([])
  })

  it('removes the older device copy too once the newer copy in memory is confirmed', () => {
    savePending(entry('acc-a', 'tab-1', 'older'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    savePending(entry('acc-a', 'tab-1', 'newer'))
    const confirmed = listPending('acc-a')[0]!
    // A different entry than the newest one changes nothing.
    dropPendingIfSame({ ...confirmed, changes: task('older') })
    expect(listPending('acc-a')).toHaveLength(1)
    dropPendingIfSame(confirmed)
    expect(listPending()).toEqual([])
    expect(localStorage.getItem('college-hub.pending.acc-a.tab-1')).toBeNull()
  })

  it('does not touch the guest data or other College Hub keys', () => {
    localStorage.setItem('college-hub.tasks', '{"state":{"tasks":[]}}')
    savePending(entry('acc-a', 'tab-1'))
    dropAllPending('acc-a')
    expect(localStorage.getItem('college-hub.tasks')).toBe('{"state":{"tasks":[]}}')
  })
})
