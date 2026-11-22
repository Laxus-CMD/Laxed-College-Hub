import { useState, type FormEvent } from 'react'
import { Input, Label } from '@/components/ui/Field'
import { accountsApi, ApiError } from '@/features/auth/api'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'

type Mode = 'login' | 'signup'

/** Error or hint under a field. Outside the <label>, so it is a description and not part of the field's name. */
function Hint({ id, error, hint }: { id: string; error?: string; hint?: string }) {
  if (!error && !hint) return null
  return (
    <span id={id} className={cn('text-[12.5px]', error ? 'text-bad' : 'text-faint')}>
      {error ?? hint}
    </span>
  )
}

/** Email and password sign-in, plus sign-up when the server allows it. */
export function AccountForm({ ready, allowSignup }: { ready: boolean; allowSignup: boolean }) {
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Record<string, string>>({})

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setFields({})
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const account =
        mode === 'signup' ? await accountsApi.signup({ name, email, password }) : await accountsApi.login({ email, password })
      const settings = useSettingsStore.getState()
      if (!settings.name) settings.setName(account.name.split(' ')[0]!.slice(0, 30))
      useAuthStore.getState().signInAccount(account)
    } catch (err) {
      if (err instanceof ApiError) {
        setFields(err.fields)
        setError(err.message)
      } else {
        setError('Something went wrong. Please try again.')
      }
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  const signup = mode === 'signup'
  const describedBy = (key: string) => (fields[key] ? `${key}-error` : undefined)

  return (
    <form aria-label={signup ? 'Create an account' : 'Sign in with email'} onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {allowSignup ? (
        <div role="tablist" aria-label="Account" className="grid grid-cols-2 rounded-full bg-fill p-0.5 text-[13px] font-medium">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={cn(
                'h-8 cursor-pointer rounded-full transition-colors',
                mode === m ? 'bg-surface text-ink shadow-thumb' : 'text-muted hover:text-ink',
              )}
            >
              {m === 'login' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      ) : null}

      {signup ? (
        <div className="flex flex-col gap-1.5">
          <Label label="Name">
            <Input
              name="name"
              autoComplete="name"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(fields.name)}
              aria-describedby={describedBy('name')}
            />
          </Label>
          <Hint id="name-error" error={fields.name} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label label="Email">
          <Input
            type="email"
            name="email"
            autoComplete={signup ? 'email' : 'username'}
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(fields.email)}
            aria-describedby={describedBy('email')}
          />
        </Label>
        <Hint id="email-error" error={fields.email} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label label="Password">
          <Input
            type="password"
            name="password"
            autoComplete={signup ? 'new-password' : 'current-password'}
            required
            minLength={signup ? 10 : undefined}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={Boolean(fields.password)}
            aria-describedby={signup || fields.password ? 'password-error' : undefined}
          />
        </Label>
        <Hint
          id="password-error"
          error={fields.password}
          hint={signup ? 'At least 10 characters. A short phrase is easier to remember.' : undefined}
        />
      </div>

      {error ? (
        <p role="alert" className="text-center text-[13px] text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || !ready}
        className="h-10 cursor-pointer rounded-full bg-accent-fill text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
      </button>
    </form>
  )
}
