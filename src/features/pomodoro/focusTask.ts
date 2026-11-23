import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useAuthStore } from '@/store/useAuthStore'

/**
 * The optional "current task" typed in Focus Space. Kept outside the timer card, so it
 * survives the card being hidden, moved to another column, or mounted again for any
 * reason. It lasts for this visit only, like before: it is not saved anywhere, and it is
 * cleared whenever the person using the app changes (see below).
 */
export const useFocusTask = create<{ task: string; setTask: (task: string) => void }>()((set) => ({
  task: '',
  setTask: (task) => set({ task }),
}))

/** Who the app is being used as: an account, a guest, or nobody (signed out). */
const identity = (s: { account: { id: string } | null; guest: boolean }) => s.account?.id ?? (s.guest ? 'guest' : null)

// The task belongs to whoever typed it. Signing out, the session ending, or anyone else
// using the app (another account, or a guest on a shared computer) starts with it empty.
useAuthStore.subscribe((now, before) => {
  if (identity(now) !== identity(before)) useFocusTask.setState({ task: '' })
})

/**
 * The current time for a timer: four times a second while it is running, so the digits turn
 * over on time, and once a minute otherwise, including as soon as `endsAt` has passed.
 * The displayed time is always worked out from `endsAt`, never counted down.
 */
export function useTimerNow(endsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined
    const slow = () => {
      clearInterval(id)
      id = setInterval(() => setNow(Date.now()), 60_000)
    }
    const fast = () => {
      clearInterval(id)
      id = setInterval(() => {
        const time = Date.now()
        setNow(time)
        // The phase just ended: nothing moves until the next action, so stop hurrying.
        if (endsAt === null || time >= endsAt) slow()
      }, 250)
    }
    const pace = () => (endsAt !== null && Date.now() < endsAt ? fast() : slow())
    pace()
    // Back from another tab: catch up at once.
    const onVisible = () => {
      if (document.hidden) return
      setNow(Date.now())
      pace()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [endsAt])
  return now
}
