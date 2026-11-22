import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Field'
import { ThemeSegmented } from '@/app/ThemeToggle'
import { Avatar } from '@/features/auth/Avatar'
import { PRIVACY_URL, TERMS_URL } from '@/features/auth/legal'
import { clearAllData, loadDemoData } from '@/store/actions'
import { useAuthStore, useProfile } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'

/** Account, name, plus clearing or restoring the sample data. */
export function SettingsDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const name = useSettingsStore((s) => s.name)
  const setName = useSettingsStore((s) => s.setName)
  const user = useProfile()
  const account = useAuthStore((s) => s.account)
  const openDialog = useUiStore((s) => s.openDialog)
  const signOut = useAuthStore((s) => s.signOut)
  const [draft, setDraft] = useState(name)
  const [armed, setArmed] = useState<'clear' | 'restore' | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setName(draft.trim())
    close()
  }

  const confirm = (kind: 'clear' | 'restore') => {
    if (armed !== kind) {
      setArmed(kind)
      return
    }
    close()
    if (kind === 'clear') clearAllData()
    else loadDemoData()
  }

  return (
    <Dialog title="Your data" onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <section aria-label="Account" className="flex items-center gap-3 rounded-xl bg-fill px-3 py-2.5">
          <Avatar user={user} className="size-9" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user ? user.name : 'Guest'}</p>
            <p className="truncate text-[13px] text-muted">
              {user ? user.email : 'Not signed in'}
              {account?.role === 'admin' ? ' · Admin' : ''}
            </p>
          </div>
          {account ? (
            <Button size="sm" variant="subtle" onClick={() => openDialog({ type: 'password' })}>
              Password
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={user ? 'ghost' : 'primary'}
            onClick={() => {
              close()
              signOut()
            }}
          >
            {user ? 'Sign out' : 'Sign in'}
          </Button>
        </section>
        <Label label="Your name">
          <Input data-autofocus maxLength={30} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Shown in the greeting" />
        </Label>
        <p className="text-[13px] text-muted">
          Courses, classes, tasks, notes and grades are saved in this browser on this device and are not sent anywhere.
          {account ? ' Your account name, email and role are stored on the College Hub server.' : ''}{' '}
          <a href={PRIVACY_URL} className="text-accent underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          {' · '}
          <a href={TERMS_URL} className="text-accent underline-offset-2 hover:underline">
            Terms
          </a>
        </p>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-muted">Appearance</span>
          <ThemeSegmented showLabels />
        </div>
        <div className="h-px bg-line" />
        <div className="flex flex-wrap gap-2.5">
          <Button size="sm" variant={armed === 'clear' ? 'destructive' : 'ghost'} onClick={() => confirm('clear')}>
            {armed === 'clear' ? 'Click again to clear' : 'Clear all data'}
          </Button>
          <Button size="sm" variant={armed === 'restore' ? 'destructive' : 'ghost'} onClick={() => confirm('restore')}>
            {armed === 'restore' ? 'Click again to restore' : 'Restore sample data'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
