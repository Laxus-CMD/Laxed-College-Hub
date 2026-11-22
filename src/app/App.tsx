import { useEffect, useLayoutEffect } from 'react'
import { AppearanceHost } from '@/app/AppearanceWindow'
import { DialogHost } from '@/app/DialogHost'
import OverviewPage from '@/app/OverviewPage'
import { SEARCH_INPUT_ID } from '@/app/SearchBox'
import { Sidebar } from '@/app/Sidebar'
import { ToastHost } from '@/app/ToastHost'
import { useRoute, type Route } from '@/lib/route'
import AssignmentsPage from '@/features/assignments/AssignmentsPage'
import AdminPage from '@/features/admin/AdminPage'
import { accountsApi, ApiError } from '@/features/auth/api'
import LoginPage from '@/features/auth/LoginPage'
import GradesPage from '@/features/grades/GradesPage'
import NotesPage from '@/features/notes/NotesPage'
import SchedulePage from '@/features/schedule/SchedulePage'
import { useAuthStore, useIsAdmin, useIsSignedIn } from '@/store/useAuthStore'
import { useApplyTheme } from '@/store/useThemeStore'
import { sync } from '@/sync/engine'
import { ImportOffer } from '@/sync/ImportDialog'
import { SyncAlert, SyncGate } from '@/sync/SyncGate'
import { useSyncStore } from '@/sync/useSyncStore'

const PAGES: Record<Route, () => React.JSX.Element> = {
  overview: OverviewPage,
  schedule: SchedulePage,
  assignments: AssignmentsPage,
  grades: GradesPage,
  notes: NotesPage,
  admin: AdminPage,
}

export default function App() {
  const route = useRoute()
  useApplyTheme()
  const signedIn = useIsSignedIn()
  const isAdmin = useIsAdmin()
  const accountId = useAuthStore((s) => s.account?.id ?? null)
  const hasAccount = accountId !== null
  const dataReady = useSyncStore((s) => s.phase === 'ready' && s.accountId === accountId)
  // Loads and saves the account's data. Before the first paint with an account, so nothing shows too early.
  useLayoutEffect(() => sync.start(), [])

  // Admin is hidden for everyone else. The API refuses them anyway.
  const Page = route === 'admin' && !isAdmin ? OverviewPage : PAGES[route]

  // The saved account is only a hint. Ask the server whether the session is still good,
  // and pick up role changes. After a 401, unsaved changes wait for the next sign-in.
  useEffect(() => {
    if (!hasAccount) return
    let cancelled = false
    accountsApi.me().then(
      (account) => {
        if (!cancelled) useAuthStore.getState().signInAccount(account)
      },
      (err: unknown) => {
        if (!cancelled && err instanceof ApiError && err.status === 401) useAuthStore.getState().sessionEnded()
      },
    )
    return () => {
      cancelled = true
    }
  }, [accountId, hasAccount])

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

  if (!signedIn) {
    return (
      <>
        <LoginPage />
        <AppearanceHost />
      </>
    )
  }
  if (hasAccount && !dataReady) return <SyncGate />

  return (
    <div className="grid min-h-svh grid-cols-[minmax(0,1fr)] lg:grid-cols-[264px_minmax(0,1fr)]">
      <Sidebar route={route} />
      <main className="min-w-0 px-4 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-9 lg:pb-14 xl:px-12">
        <div key={route} className="mx-auto max-w-[1180px] animate-[fade-in_200ms_ease-out]">
          <SyncAlert />
          <Page />
        </div>
      </main>
      <ImportOffer />
      <DialogHost />
      <AppearanceHost />
      <ToastHost />
    </div>
  )
}
