import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/useAuthStore'
import { sync } from '@/sync/engine'
import { useSyncStore } from '@/sync/useSyncStore'

/** Full page while the account's data loads, or when it cannot. */
export function SyncGate() {
  const failed = useSyncStore((s) => s.phase === 'load-error')
  const message = useSyncStore((s) => s.message)
  const account = useAuthStore((s) => s.account)
  const signOut = useAuthStore((s) => s.signOut)

  return (
    <main className="grid min-h-svh place-items-center px-4">
      <div className="flex max-w-[360px] flex-col items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-accent-fill text-on-accent shadow-thumb">
          <GraduationCap className="size-8" aria-hidden="true" />
        </span>
        {failed ? (
          <>
            <h1 className="text-lg font-semibold">Could not load your data</h1>
            <p role="alert" className="text-[13.5px] text-muted">
              {message}
            </p>
            <div className="flex gap-2.5">
              <Button onClick={signOut}>Sign out</Button>
              <Button variant="primary" onClick={() => account && void sync.open(account)}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="text-[13.5px] text-muted">
            Loading your data…
          </p>
        )}
      </div>
    </main>
  )
}

/** Shown on every page while changes are not reaching the account. */
export function SyncAlert() {
  const status = useSyncStore((s) => s.status)
  const message = useSyncStore((s) => s.message)
  const hasAccount = useAuthStore((s) => s.account !== null)
  if (!hasAccount || (status !== 'retrying' && status !== 'blocked')) return null
  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-3.5 rounded-2xl border border-line bg-surface py-3 pr-3 pl-5 shadow-card dark:border-transparent"
    >
      <p className="min-w-56 flex-1 text-[13.5px] text-bad">
        {status === 'retrying' ? 'Your latest changes are not saved yet. Keep this page open while we keep trying.' : message}
      </p>
      <Button size="sm" onClick={() => void sync.retryNow()}>
        Try now
      </Button>
    </div>
  )
}
