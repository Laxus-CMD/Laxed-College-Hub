import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Field'
import { accountsApi, ApiError } from '@/features/auth/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useUiStore } from '@/store/useUiStore'

/** Permanently deletes the signed-in account, after the password or (for Google accounts) the typed email. */
export function DeleteAccountDialog() {
  const account = useAuthStore((s) => s.account)
  const close = useUiStore((s) => s.closeDialog)
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!account) return null
  const byPassword = account.hasPassword

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await accountsApi.deleteAccount(byPassword ? { password: value } : { email: value })
      close()
      useAuthStore.getState().accountDeleted()
    } catch (err) {
      const field = err instanceof ApiError ? (err.fields.password ?? err.fields.email) : undefined
      setError(field ?? (err instanceof Error ? err.message : 'Something went wrong.'))
      setBusy(false)
    }
  }

  return (
    <Dialog title="Delete account" onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          This permanently deletes your College Hub account ({account.email}) and everything stored with it on our server. It cannot be
          undone.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label label={byPassword ? 'Your password' : `Type ${account.email} to confirm`}>
            <Input
              data-autofocus
              type={byPassword ? 'password' : 'email'}
              autoComplete={byPassword ? 'current-password' : 'off'}
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'delete-account-error' : undefined}
            />
          </Label>
          {error ? (
            <span id="delete-account-error" role="alert" className="text-[12.5px] text-bad">
              {error}
            </span>
          ) : null}
        </div>
        <div className="flex justify-end gap-2.5">
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="destructive" disabled={busy || !value}>
            {busy ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
