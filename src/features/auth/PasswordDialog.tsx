import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Field'
import { accountsApi, ApiError } from '@/features/auth/api'
import { useUiStore } from '@/store/useUiStore'

/** Change the password of a College Hub account. Other devices are signed out. */
export function PasswordDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const showToast = useUiStore((s) => s.showToast)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFields({})
    setError(null)
    try {
      await accountsApi.changePassword({ currentPassword: current, newPassword: next })
      close()
      showToast({ message: 'Password changed. Other devices were signed out.' })
    } catch (err) {
      setFields(err instanceof ApiError ? err.fields : {})
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Change password" onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label label="Current password">
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-invalid={Boolean(fields.currentPassword)}
              aria-describedby={fields.currentPassword ? 'current-password-error' : undefined}
            />
          </Label>
          {fields.currentPassword ? (
            <span id="current-password-error" className="text-[12.5px] text-bad">
              {fields.currentPassword}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label label="New password">
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-invalid={Boolean(fields.newPassword)}
              aria-describedby="new-password-hint"
            />
          </Label>
          <span id="new-password-hint" className={fields.newPassword ? 'text-[12.5px] text-bad' : 'text-[12.5px] text-faint'}>
            {fields.newPassword ?? 'At least 10 characters.'}
          </span>
        </div>
        {error && !Object.keys(fields).length ? (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2.5">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy || !current || !next}>
            {busy ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
