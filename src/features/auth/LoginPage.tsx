import { CalendarDays, ChartColumn, GraduationCap, NotebookPen, PencilLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ThemeToggleButton } from '@/app/ThemeToggle'
import { AccountForm } from '@/features/auth/AccountForm'
import { GOOGLE_CLIENT_ID, loadGoogleIdentity, parseGoogleCredential } from '@/features/auth/google'
import { PRIVACY_URL, TERMS_URL } from '@/features/auth/legal'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useResolvedTheme } from '@/store/useThemeStore'

const HIGHLIGHTS = [
  { icon: CalendarDays, text: 'Your weekly schedule and what is on right now' },
  { icon: PencilLine, text: 'Deadlines sorted by urgency, with Canvas import' },
  { icon: ChartColumn, text: 'What-if grades and GPA planning' },
  { icon: NotebookPen, text: 'Markdown notes linked to each class' },
]

type Status = 'loading' | 'ready' | 'error' | 'unconfigured'

/** Google's own button, so it follows their branding rules and handles the popup. */
function GoogleButton({ onError }: { onError: (message: string) => void }) {
  const slot = useRef<HTMLDivElement>(null)
  const theme = useResolvedTheme()
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
            const user = parseGoogleCredential(credential, GOOGLE_CLIENT_ID)
            if (!user) {
              onError('Google sign-in did not work. Please try again.')
              return
            }
            const settings = useSettingsStore.getState()
            if (!settings.name) settings.setName(user.givenName.slice(0, 30))
            useAuthStore.getState().signIn(user)
          },
        })
        slot.current.replaceChildren()
        gis.renderButton(slot.current, {
          type: 'standard',
          theme: theme === 'dark' ? 'filled_black' : 'outline',
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
  }, [theme, onError])

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

export default function LoginPage() {
  const continueAsGuest = useAuthStore((s) => s.continueAsGuest)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="relative grid min-h-svh place-items-center px-4 py-10">
      <ThemeToggleButton className="absolute top-[max(16px,env(safe-area-inset-top))] right-4" />
      <main className="w-full max-w-[400px] animate-[fade-in_200ms_ease-out]">
        <section
          aria-labelledby="login-title"
          className="rounded-3xl border border-line bg-surface px-6 py-8 shadow-card dark:border-transparent sm:px-8"
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
            <AccountForm />
            <div className="flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
            <GoogleButton onError={setError} />
            {error ? (
              <p role="alert" className="text-center text-[13px] text-bad">
                {error}
              </p>
            ) : null}
            <div className="flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>
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
          Your courses, tasks, notes and grades stay saved in this browser. An email account stores your name, email and a
          hashed password on the College Hub server. Google only tells College Hub your name, email and photo.
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
