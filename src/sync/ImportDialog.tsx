import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { plural } from '@/lib/time'
import { useAuthStore } from '@/store/useAuthStore'
import { useUiStore } from '@/store/useUiStore'
import { clearDeviceData, dismissImport, downloadBackup, hasOwnData, importDismissed, mergeImport, parseBackup, readDeviceDoc, withoutUntouchedSample, type Merge } from '@/sync/deviceData'
import { KINDS, readStores, type Doc } from '@/sync/doc'
import { sync } from '@/sync/engine'
import { useSyncStore } from '@/sync/useSyncStore'

/** This browser's guest data, without sample data nobody touched. Null when there is nothing to bring over. */
function ownDeviceDoc(): Doc | null {
  const doc = readDeviceDoc()
  const own = doc && withoutUntouchedSample(doc)
  return own && hasOwnData(own) ? own : null
}

function summary({ added }: Merge): string {
  const parts = [
    added.courses && plural(added.courses, 'course'),
    added.sessions && plural(added.sessions, 'class', 'classes'),
    added.tasks && plural(added.tasks, 'task'),
    added.notes && plural(added.notes, 'note'),
    added.components && plural(added.components, 'grade component'),
  ].filter(Boolean) as string[]
  if (parts.length === 0) return 'some course and GPA details'
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/** Opens the import by itself once, when this browser has something the account does not. */
const offered = new Set<string>()
export function ImportOffer() {
  const accountId = useSyncStore((s) => (s.phase === 'ready' ? s.accountId : null))
  const openDialog = useUiStore((s) => s.openDialog)
  useEffect(() => {
    if (!accountId || offered.has(accountId)) return
    offered.add(accountId)
    const doc = readStores()
    const own = ownDeviceDoc()
    if (!own || !mergeImport(doc, own).anything) return
    // An empty account is always asked: the one who said "Not now" may have been someone else.
    if (KINDS.every((k) => doc[k].length === 0) || !importDismissed()) openDialog({ type: 'import' })
  }, [accountId, openDialog])
  return null
}

type Step = 'choose' | 'saving' | 'done' | 'partly' | 'pending'

/** Adds data from this browser, or from a backup file, to the account. */
export function ImportDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const email = useAuthStore((s) => s.account?.email)
  const [device, setDevice] = useState(ownDeviceDoc)
  const [file, setFile] = useState<{ name: string; doc: Doc } | null>(null)
  const [step, setStep] = useState<Step>('choose')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState('')
  const [removeAfter, setRemoveAfter] = useState(true)
  const [unstored, setUnstored] = useState<string[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  const source = file?.doc ?? device
  const fromDevice = !file && device !== null
  const merge = useMemo(() => (source && step === 'choose' ? mergeImport(readStores(), source) : null), [source, step])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setError(null)
    const doc = f.size > 20_000_000 ? null : parseBackup(await f.text())
    if (doc) setFile({ name: f.name, doc: withoutUntouchedSample(doc) })
    else setError('That is not a College Hub backup file.')
  }

  const onImport = async () => {
    if (!source) return
    // Against what the account has now, not when the dialog opened.
    const now = mergeImport(readStores(), source)
    setStep('saving')
    setError(null)
    const outcome = await sync.addAll(now.doc)
    if (typeof outcome === 'object' && 'error' in outcome) {
      setError(outcome.error)
      setStep('choose')
      return
    }
    setResult(summary(now))
    // Only once the server has all of it: what the account cannot keep yet stays in this browser.
    if (outcome === 'saved' && fromDevice && removeAfter) clearDeviceData()
    if (typeof outcome === 'object' && 'unstored' in outcome) setUnstored(outcome.unstored.map((f) => (f === 'progress' ? 'task progress' : 'time estimates')))
    setStep(outcome === 'saved' ? 'done' : outcome === 'pending' ? 'pending' : 'partly')
  }

  const onRemove = () => {
    clearDeviceData()
    setDevice(null)
    close()
    useUiStore.getState().showToast({ message: 'Removed from this browser. Your account still has everything.' })
  }

  const busy = step === 'saving'
  const onClose = () => {
    if (busy) return
    if (step === 'choose' && device) dismissImport()
    close()
  }

  return (
    <Dialog title="Import your data" onClose={onClose}>
      {step === 'done' || step === 'partly' || step === 'pending' ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm">
            {step === 'done'
              ? `Added ${result} to your account.${fromDevice && removeAfter ? ' The copy in this browser was removed.' : ''}`
              : step === 'partly'
                ? `Added ${result} to your account. Your account cannot keep ${unstored.join(' or ')} yet, so ${
                    fromDevice ? 'the copy in this browser stays, and holds them' : 'keep your backup file: it holds them'
                  }.`
                : `Added ${result}, but it is not saved yet. Keep this page open: we keep trying. The copy in this browser stays.`}
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {merge === null && !busy ? (
            <p className="text-sm text-muted">There is nothing to import from this browser. If you have a College Hub backup file, choose it here.</p>
          ) : null}
          {merge?.anything ? (
            <>
              <p className="text-sm">
                {file ? `${file.name} has` : 'This browser has'} <b className="font-semibold">{summary(merge)}</b> that {email ?? 'your account'} does not.
                {merge.skipped ? ` ${plural(merge.skipped, 'other item')} you already have will be left as they are in your account.` : ''}
              </p>
              {fromDevice ? <p className="text-[13px] text-warn">Only add it if it is yours. Someone else may have used this browser.</p> : null}
            </>
          ) : null}
          {merge?.anything === false ? (
            <p className="text-sm">Everything in {file ? file.name : 'this browser'} is already in your account.</p>
          ) : null}
          {fromDevice && merge?.anything ? (
            <label className="flex items-start gap-2.5 text-[13px]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-accent-fill"
                checked={removeAfter}
                onChange={(e) => setRemoveAfter(e.target.checked)}
              />
              Remove it from this browser once it is safely in my account
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-[13px] text-bad">
              {error}
            </p>
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Backup file"
            tabIndex={-1}
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2.5">
            {fromDevice && device ? (
              <Button size="sm" disabled={busy} onClick={() => downloadBackup(device)}>
                Download a backup first
              </Button>
            ) : null}
            <Button size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>
              Choose a backup file
            </Button>
            {file && device ? (
              <Button size="sm" disabled={busy} onClick={() => setFile(null)}>
                Use this browser instead
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button disabled={busy} onClick={onClose}>
              Not now
            </Button>
            {fromDevice && merge?.anything === false ? (
              <Button variant="danger" onClick={onRemove}>
                Remove it from this browser
              </Button>
            ) : null}
            {busy || (merge?.anything) ? (
              <Button variant="primary" disabled={busy} onClick={() => void onImport()}>
                {busy ? 'Saving…' : 'Add to my account'}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}
