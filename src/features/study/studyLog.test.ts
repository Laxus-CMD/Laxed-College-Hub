import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@/features/auth/api'
import { useAuthStore } from '@/store/useAuthStore'
import { clearStudyLog, readLastSession, recordSession, studyKeys } from './studyLog'

vi.mock('@/features/auth/api', async (real) => ({
  ...(await real<typeof import('@/features/auth/api')>()),
  accountsApi: { logout: vi.fn(() => Promise.resolve()) },
}))

const A = { id: '00000000-0000-4000-8000-00000000000a' } as Account
const B = { id: '00000000-0000-4000-8000-00000000000b' } as Account
const MIN = 60_000
const T = new Date(2026, 10, 23, 15, 0).getTime()

beforeEach(() => {
  for (const s of ['guest', A.id, B.id]) clearStudyLog(s)
  useAuthStore.setState({ account: A, guest: false })
})

describe('the study log', () => {
  it('keeps the newest session and ignores older or repeated ones', () => {
    recordSession(A.id, { task: '  Essay outline ', endedAt: T, focusMs: 25 * MIN })
    recordSession(A.id, { task: 'Older', endedAt: T - MIN, focusMs: 25 * MIN })
    recordSession(A.id, { task: null, endedAt: T, focusMs: 25 * MIN })
    expect(readLastSession()).toEqual({ task: 'Essay outline', endedAt: T, focusMs: 25 * MIN })
  })

  it.each([
    ['the newer report lands first', [200_000, 100_000]],
    ['the older report lands first', [100_000, 200_000]],
  ] as const)('never rolls back to an older session when two tabs report different ones: %s', (_, order) => {
    // Two tabs, two different deadlines, written in either order: the newest always wins.
    for (const endedAt of order) recordSession(A.id, { task: endedAt === 200_000 ? 'New' : 'Old', endedAt, focusMs: 25 * MIN })
    expect(readLastSession()).toEqual({ task: 'New', endedAt: 200_000, focusMs: 25 * MIN })
  })

  it('stays on the newer session even when an older report writes after it, having looked before it', () => {
    // The older tab looked first and saw nothing; the newer tab then wrote; the older tab writes last.
    const look = vi.spyOn(Storage.prototype, 'key')
    recordSession(A.id, { task: 'New', endedAt: 200_000, focusMs: 25 * MIN })
    look.mockImplementation(() => null)
    recordSession(A.id, { task: 'Old', endedAt: 100_000, focusMs: 25 * MIN })
    look.mockRestore()
    expect(readLastSession()).toEqual({ task: 'New', endedAt: 200_000, focusMs: 25 * MIN })
  })

  it.each([
    ['the tab with the task reports first', ['Essay outline', null]],
    ['the tab with nothing typed reports first', [null, 'Essay outline']],
  ] as const)('keeps the typed task when two tabs report one session: %s', (_, [first, second]) => {
    recordSession(A.id, { task: first, endedAt: T, focusMs: 25 * MIN })
    recordSession(A.id, { task: second, endedAt: T, focusMs: 25 * MIN })
    expect(readLastSession()).toEqual({ task: 'Essay outline', endedAt: T, focusMs: 25 * MIN })
  })

  it('does not lend an older task to a newer session', () => {
    recordSession(A.id, { task: 'Essay outline', endedAt: T, focusMs: 25 * MIN })
    recordSession(A.id, { task: null, endedAt: T + 60 * MIN, focusMs: 25 * MIN })
    expect(readLastSession()).toEqual({ task: null, endedAt: T + 60 * MIN, focusMs: 25 * MIN })
  })

  it('keeps only what the last session needs', () => {
    recordSession(A.id, { task: 'One', endedAt: T, focusMs: 25 * MIN })
    recordSession(A.id, { task: 'Two', endedAt: T + MIN, focusMs: 25 * MIN })
    recordSession(A.id, { task: null, endedAt: T + 2 * MIN, focusMs: 25 * MIN })
    expect(studyKeys(A.id)).toHaveLength(1)
  })

  it('ignores less than a minute of focus, and keeps an empty task as none', () => {
    recordSession(A.id, { task: 'Barely started', endedAt: T, focusMs: 59_000 })
    expect(readLastSession()).toBeNull()
    recordSession(A.id, { task: '   ', endedAt: T, focusMs: 2 * MIN })
    expect(readLastSession()).toEqual({ task: null, endedAt: T, focusMs: 2 * MIN })
  })

  it('keeps each person apart', () => {
    recordSession(A.id, { task: 'A task', endedAt: T, focusMs: 25 * MIN })
    useAuthStore.setState({ account: B })
    expect(readLastSession()).toBeNull()
    useAuthStore.setState({ account: null, guest: true })
    expect(readLastSession()).toBeNull()
  })

  it('gives a session only to the person who started the timer, while they are still here', () => {
    // A started it, B is signed in when it ends: neither B nor a leftover record for A gets it.
    useAuthStore.setState({ account: B })
    recordSession(A.id, { task: 'A task', endedAt: T, focusMs: 25 * MIN })
    expect(readLastSession()).toBeNull()
    expect(studyKeys(A.id)).toEqual([])
    // A timer from before owners were kept says nothing about who started it.
    recordSession(undefined, { task: 'Unknown', endedAt: T, focusMs: 25 * MIN })
    expect(readLastSession()).toBeNull()
  })

  it.each([
    ['signs out', () => useAuthStore.getState().signOut()],
    ['loses the session', () => useAuthStore.getState().sessionEnded()],
    ['is signed out by the server', () => useAuthStore.getState().endedOnServer()],
    ['is replaced by another account', () => useAuthStore.getState().signInAccount(B)],
  ])('leaves this browser when the account %s', (_, leave) => {
    recordSession(A.id, { task: 'Private', endedAt: T, focusMs: 25 * MIN })
    expect(studyKeys(A.id)).toHaveLength(2)
    leave()
    expect(studyKeys(A.id)).toEqual([])
  })

  it('stays for a guest, like the rest of what a guest saves here', () => {
    useAuthStore.setState({ account: null, guest: true })
    recordSession('guest', { task: 'Guest task', endedAt: T, focusMs: 25 * MIN })
    useAuthStore.getState().signInAccount(A)
    useAuthStore.getState().signOut()
    useAuthStore.getState().continueAsGuest()
    expect(readLastSession()?.task).toBe('Guest task')
  })

  it('reads anything odd as no session', () => {
    const at = `college-hub.study.${A.id}.s.`
    for (const raw of ['', 'nope', JSON.stringify({ v: 2, focusMs: MIN }), JSON.stringify({ v: 1, focusMs: -5 }), JSON.stringify({ v: 1 })]) {
      localStorage.setItem(`${at}${T}`, raw)
      expect(readLastSession()).toBeNull()
    }
    localStorage.setItem(`${at}not-a-time`, JSON.stringify({ v: 1, focusMs: MIN }))
    expect(readLastSession()).toBeNull()
  })
})
