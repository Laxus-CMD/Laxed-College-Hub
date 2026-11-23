import { useEffect, useState } from 'react'
import { readDevice, removeDevice, writeDevice } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { defaultLayout, normalize, type DashboardLayout } from '@/features/dashboard/layout'

/**
 * Where a dashboard layout is kept. Per person: each account has its own, and guests share one.
 * Kept in this browser. Layouts are a preference, not student data, and nothing in them
 * identifies anyone.
 */
export const dashboardKey = (scope: string) => `college-hub.dashboard.${scope}`

export function readLayout(key: string): DashboardLayout {
  try {
    return normalize(JSON.parse(readDevice(key) ?? 'null'))
  } catch {
    return defaultLayout()
  }
}

/** The saved dashboard layout for whoever is using the app, and a way to change or reset it. */
export function useDashboardLayout() {
  const scope = useAuthStore((s) => s.account?.id ?? 'guest')
  const key = dashboardKey(scope)
  const [state, setState] = useState(() => ({ key, layout: readLayout(key) }))
  // Someone else signed in: show their layout, not the last person's.
  if (state.key !== key) setState({ key, layout: readLayout(key) })

  // Another tab changed it.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) setState({ key, layout: readLayout(key) })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const save = (layout: DashboardLayout) => {
    writeDevice(key, JSON.stringify(layout))
    setState({ key, layout })
  }
  /** Back to the original layout. Only this preference is removed; no data is touched. */
  const reset = () => {
    removeDevice(key)
    setState({ key, layout: defaultLayout() })
  }
  return { layout: state.key === key ? state.layout : readLayout(key), save, reset }
}
