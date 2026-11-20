import { useEffect } from 'react'
import { DialogHost } from '@/app/DialogHost'
import OverviewPage from '@/app/OverviewPage'
import { SEARCH_INPUT_ID } from '@/app/SearchBox'
import { Sidebar } from '@/app/Sidebar'
import { ToastHost } from '@/app/ToastHost'
import { useRoute, type Route } from '@/lib/route'
import AssignmentsPage from '@/features/assignments/AssignmentsPage'
import LoginPage from '@/features/auth/LoginPage'
import GradesPage from '@/features/grades/GradesPage'
import NotesPage from '@/features/notes/NotesPage'
import SchedulePage from '@/features/schedule/SchedulePage'
import { useIsSignedIn } from '@/store/useAuthStore'
import { useApplyTheme } from '@/store/useThemeStore'

const PAGES: Record<Route, () => React.JSX.Element> = {
  overview: OverviewPage,
  schedule: SchedulePage,
  assignments: AssignmentsPage,
  grades: GradesPage,
  notes: NotesPage,
}

export default function App() {
  const route = useRoute()
  const Page = PAGES[route]
  useApplyTheme()
  const signedIn = useIsSignedIn()

  // Press "/" anywhere outside a text field to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.matches('input, textarea, select, [contenteditable]') || document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      document.getElementById(SEARCH_INPUT_ID)?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Start each page at the top.
  useEffect(() => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 })
  }, [route])

  if (!signedIn) return <LoginPage />

  return (
    <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)]">
      <Sidebar route={route} />
      <main className="min-w-0 px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-9 lg:pb-14 xl:px-12">
        <div key={route} className="mx-auto max-w-[1180px] animate-[fade-in_200ms_ease-out]">
          <Page />
        </div>
      </main>
      <DialogHost />
      <ToastHost />
    </div>
  )
}
