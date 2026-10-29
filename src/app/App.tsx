import { useEffect } from 'react'
import { DialogHost } from '@/app/DialogHost'
import OverviewPage from '@/app/OverviewPage'
import { SEARCH_INPUT_ID } from '@/app/SearchBox'
import { Sidebar } from '@/app/Sidebar'
import { ToastHost } from '@/app/ToastHost'
import { useRoute, type Route } from '@/lib/route'
import AssignmentsPage from '@/features/assignments/AssignmentsPage'
import GradesPage from '@/features/grades/GradesPage'
import NotesPage from '@/features/notes/NotesPage'
import SchedulePage from '@/features/schedule/SchedulePage'

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

  return (
    <div className="grid min-h-svh lg:grid-cols-[316px_minmax(0,1fr)]">
      <Sidebar route={route} />
      <main className="min-w-0 px-4 pt-3 pb-14 lg:py-8 lg:pr-10 lg:pl-9">
        <div className="max-w-[1160px]">
          <Page />
        </div>
      </main>
      <DialogHost />
      <ToastHost />
    </div>
  )
}
