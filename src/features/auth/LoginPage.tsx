import { CalendarDays, ChartColumn, GraduationCap, NotebookPen, PencilLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ThemesButton, ThemeToggleButton } from '@/app/ThemeToggle'
import { AccountForm } from '@/features/auth/AccountForm'
import { accountsApi, ApiError, type SignInOptions } from '@/features/auth/api'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity } from '@/features/auth/google'
import { PRIVACY_URL, TERMS_URL } from '@/features/auth/legal'
import { useAuthStore } from '@/store/useAuthStore'
import { useResolvedMode } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'
import { Button } from '@/components/ui/Button'
import { sync } from '@/sync/engine'
import { listPending } from '@/sync/pending'
import { useSyncStore } from '@/sync/useSyncStore'

const HIGHLIGHTS = [
  { icon: CalendarDays, text: 'Your weekly schedule and what is on right now' },
  { icon: PencilLine, text: 'Deadlines sorted by urgency, with Canvas import' },
  { icon: ChartColumn, text: 'What-if grades and GPA planning' },
  { icon: NotebookPen, text: 'Markdown notes linked to each class' },
]

type Status = 'loading' | 'ready' | 'error' | 'unconfigured'

/** Google's own button, so it follows their branding rules and handles the popup. */
function GoogleButton({ onError }: { onError: (message: string | null) => void }) {
  const slot = useRef<HTMLDivElement>(null)
  const mode = useResolvedMode()
  const [status, setStatus] = useState<Status>(GOOGLE_CLIENT_ID ? 'loading' : 'unconfigured')

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadGoogleIdentity()
      .then((gis) => {
        if (cancelled || !slot.current) return
        gis.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'popup',
          callback: ({ credential }) => {
            onError(null)
            accountsApi.google(credential).then(
              ({ user, passwordRemoved }) => {
                useAuthStore.getState().signInAccount(user)
                if (passwordRemoved) {
                  useUiStore.getState().showToast({ message: 'Google is now linked. Your old password no longer works.' })
                }
              },
              (err: unknown) => onError(err instanceof ApiError ? err.message : 'Google sign-in did not work. Please try again.'),
            )
          },
        })
        slot.current.replaceChildren()
        gis.renderButton(slot.current, {
          type: 'standard',
          theme: mode === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(320, slot.current.clientWidth || 320),
        })
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [mode, onError])

  if (status === 'unconfigured') {
    return (
      <p role="note" className="rounded-xl bg-fill px-3.5 py-2.5 text-[13px] text-muted">
        Google sign-in is not set up yet. Add <code className="font-mono text-ink">VITE_GOOGLE_CLIENT_ID</code> to{' '}
        <code className="font-mono text-ink">.env.local</code> to turn it on.
      </p>
    )
  }

  return (
    <div className="flex min-h-11 flex-col items-center justify-center">
      <div ref={slot} className="flex w-full justify-center" />
      {status === 'loading' ? <p className="text-[13px] text-faint">Loading Google sign-in…</p> : null}
      {status === 'error' ? (
        <p role="alert" className="text-[13px] text-bad">
          Could not reach Google. Check your connection and reload the page.
        </p>
      ) : null}
    </div>
  )
}

function Or() {
  return (
    <div className="flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/** Changes an account made on this device that are not in the account yet. */
function HeldChanges({ email }: { email: string }) {
  const [armed, setArmed] = useState(false)
  const forget = () => {
    if (!armed) return setArmed(true)
    for (const p of listPending()) if (p.email === email) sync.forget(p.accountId)
    setArmed(false)
  }
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-xl bg-fill px-3.5 py-2.5 text-[13px] text-warn">
      <p>
        Changes for {email} are kept on this device but are not in that account yet. Sign in as {email} to save them.
      </p>
      <p className="text-muted">Not yours, or on a shared computer? You can delete them from this device instead.</p>
      <Button size="sm" variant={armed ? 'destructive' : 'ghost'} className="self-start" onClick={forget}>
        {armed ? 'Click again to delete them' : 'Delete from this device'}
      </Button>
    </div>
  )
}

export default function LoginPage() {
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest)
  const heldFor = useSyncStore((s) => s.heldFor)
  const [error, setError] = useState<string | null>(null)
  // undefined while asking the server, null when it cannot be reached.
  const [options, setOptions] = useState<SignInOptions | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    accountsApi.options().then((o) => {
      if (!cancelled) setOptions(o)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="relative grid min-h-svh place-items-center px-4 py-10">
      <div className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 flex gap-1">
        <ThemesButton />
        <ThemeToggleButton />
      </div>
      <main className="w-full max-w-[400px] animate-[fade-in_200ms_ease-out]">
        <section
          aria-labelledby="login-title"
          className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-8"
        >
          <div className="flex flex-col items-center text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-accent-fill text-on-accent shadow-thumb">
              <GraduationCap className="size-8" aria-hidden="true" />
            </span>
            <h1 id="login-title" className="mt-5 text-[26px] font-semibold tracking-[-0.02em]">
              College Hub
            </h1>
            <p className="mt-1.5 text-[15px] text-muted">Sign in to your schedule, deadlines, notes and grades.</p>
          </div>

          <ul className="mt-7 flex flex-col gap-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[13.5px] text-ink/85">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-fill text-accent">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3">
            {heldFor ? <HeldChanges email={heldFor} /> : null}
            {options === null ? (
              <p role="note" className="rounded-xl bg-fill px-3.5 py-2.5 text-[13px] text-muted">
                Sign-in is offline right now. You can still continue without an account.
              </p>
            ) : (
              <>
                <GoogleButton onError={setError} />
                {error ? (
                  <p role="alert" className="text-center text-[13px] text-bad">
                    {error}
                  </p>
                ) : null}
                <Or />
                <AccountForm ready={options !== undefined} allowSignup={options?.emailSignup ?? false} />
              </>
            )}
            <Or />
            <button
              type="button"
              onClick={continueAsGuest}
              className="h-10 cursor-pointer rounded-full text-sm font-medium text-accent transition-colors hover:bg-fill"
            >
              Continue without an account
            </button>
          </div>
        </section>
        <p className="mt-5 px-4 text-center text-xs text-faint">
          An account is recommended. Without one, everything stays in this browser only and is lost if you clear it.
        </p>
        <p className="mt-2 px-4 text-center text-xs text-faint">
          By continuing, you agree to the{' '}
          <a href={TERMS_URL} className="text-accent underline-offset-2 hover:underline">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href={PRIVACY_URL} className="text-accent underline-offset-2 hover:underline">
            Privacy Policy
          </a>
          .
        </p>
      </main>
    </div>
  )
}
