import type { Account } from '@/features/auth/api'
import { makeDemoData } from '@/data/demo'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'

export const TEST_USER: Account = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Ana Cruz',
  email: 'ana@example.com',
  role: 'user',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  picture: null,
  hasPassword: false,
  hasGoogle: true,
}

/** Puts every store back to the demo data for a given moment. Used by tests. */
export function resetStores(now: Date): void {
  const demo = makeDemoData(now)
  useScheduleStore.setState({ courses: demo.courses, sessions: demo.sessions })
  useTaskStore.setState({ tasks: demo.tasks })
  useNoteStore.setState({ notes: demo.notes })
  useGradeStore.setState({ components: demo.components, overrides: {}, targets: {}, prior: { cgpa: null, units: null } })
  useSettingsStore.setState({ name: '', isDemo: true, bannerDismissed: false })
  useAuthStore.setState({ account: TEST_USER, guest: false })
  useThemeStore.setState({ theme: 'system' })
  delete document.documentElement.dataset.theme
  useUiStore.setState({
    dialog: null,
    drawerSessionId: null,
    taskCourse: '',
    selectedNoteId: null,
    flashTaskId: null,
    toast: null,
  })
  window.location.hash = ''
}
