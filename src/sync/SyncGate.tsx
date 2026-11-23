import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useStorageHealth } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { readStores } from '@/sync/doc'
import { downloadBackup } from '@/sync/deviceData'
import { sync } from '@/sync/engine'
import { listPending } from '@/sync/pending'
import { accountLine, guestLine } from '@/sync/statusLines'
import { useSyncStore } from '@/sync/useSyncStore'

/** Full page while the account's data loads, or when it cannot. */
export function SyncGate() {
  const failed = useSyncStore((s) => s.phase === 'load-error')
  const message = useSyncStore((s) => s.message)
  const account = useAuthStore((s) => s.account)
  const signOut = useAuthStore((s) => s.signOut)
  // Read when the page shows, which is when it matters: right after a reload.
  const waiting = account ? listPending(account.id).length > 0 : false

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
            {waiting ? (
              <p role="note" className="rounded-xl bg-fill px-3.5 py-2.5 text-[13px] text-warn">
                Changes you made before are kept on this device. They will be saved to your account once it loads.
              </p>
            ) : null}
            <div className="flex gap-2.5">
              <Button onClick={signOut}>Sign out</Button>
              <Button variant="primary" onClick={() => account && void sync.open(account)}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <p role="status" className="text-[13.5px] text-muted">
            {waiting ? 'Loading your data and saving changes from your last visit…' : 'Loading your data…'}
          </p>
        )}
      </div>
    </main>
  )
}

/** Shown on every page while changes are not reaching the account, or not being kept at all. */
export function SyncAlert() {
  const status = useSyncStore((s) => s.status)
  const local = useSyncStore((s) => s.local)
  const message = useSyncStore((s) => s.message)
  const hasAccount = useAuthStore((s) => s.account !== null)
  const storageOk = useStorageHealth((s) => s.ok)

  if (!hasAccount) {
    if (storageOk) return null
    return (
      <Alert text={guestLine(false).full}>
        <Button size="sm" onClick={() => downloadBackup(readStores())}>
          Download my data
        </Button>
      </Alert>
    )
  }
  if (status !== 'retrying' && status !== 'blocked' && local !== 'memory') return null
  const line = accountLine(status, local)
  // A refusal from the server explains itself best.
  const text = status === 'blocked' && message ? `${message} ${line.full}` : line.full
  return (
    <Alert text={text} tone={local === 'memory' || status === 'blocked' ? 'bad' : 'warn'}>
      {status === 'retrying' || status === 'blocked' ? (
        <Button size="sm" onClick={() => void sync.retryNow()}>
          Try now
        </Button>
      ) : null}
    </Alert>
  )
}

function Alert({ text, tone = 'bad', children }: { text: string; tone?: 'bad' | 'warn'; children?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center gap-3.5 rounded-2xl border border-line bg-surface py-3 pr-3 pl-5 shadow-card"
    >
      <p className={`min-w-56 flex-1 text-[13.5px] ${tone === 'bad' ? 'text-bad' : 'text-warn'}`}>{text}</p>
      {children}
    </div>
  )
}
