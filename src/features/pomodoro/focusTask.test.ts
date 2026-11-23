import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@/features/auth/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useFocusTask } from './focusTask'

vi.mock('@/features/auth/api', async (real) => ({
  ...(await real<typeof import('@/features/auth/api')>()),
  accountsApi: { logout: vi.fn(() => Promise.resolve()) },
}))

const A = { id: '00000000-0000-4000-8000-00000000000a' } as Account
const B = { id: '00000000-0000-4000-8000-00000000000b' } as Account
const type = (task: string) => useFocusTask.getState().setTask(task)
const task = () => useFocusTask.getState().task

beforeEach(() => {
  useAuthStore.setState({ account: A, guest: false })
  useFocusTask.setState({ task: '' })
})

describe('the Focus Space task belongs to whoever typed it', () => {
  it('stays while the same person keeps using the app', () => {
    type('Chapter 6 problems')
    useAuthStore.setState({ account: { ...A, name: 'Renamed' } })
    expect(task()).toBe('Chapter 6 problems')
  })

  it.each([
    ['signs out', () => useAuthStore.getState().signOut()],
    ['has the session end', () => useAuthStore.getState().sessionEnded()],
    ['is signed out by the server', () => useAuthStore.getState().endedOnServer()],
  ])('is gone for the next guest when user A %s', (_, end) => {
    type('Private: call about my grades')
    end()
    expect(task()).toBe('')
    useAuthStore.getState().continueAsGuest()
    expect(task()).toBe('')
  })

  it('is gone when user B signs in after user A', () => {
    type('Private: call about my grades')
    useAuthStore.getState().signOut()
    useAuthStore.getState().signInAccount(B)
    expect(task()).toBe('')
    // Even if one account replaces another directly.
    type('B task')
    useAuthStore.getState().signInAccount(A)
    expect(task()).toBe('')
  })

  it('is gone when a guest signs in to an account', () => {
    useAuthStore.setState({ account: null, guest: true })
    type('Guest task')
    useAuthStore.getState().signInAccount(B)
    expect(task()).toBe('')
  })
})
