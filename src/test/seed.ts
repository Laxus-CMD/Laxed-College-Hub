import { makeDemoData } from '@/data/demo'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'
import { sync } from '@/sync/engine'

/** Puts every store back to the demo data for a given moment. Used by tests. */
export function resetStores(now: Date): void {
  // Forget any account from the test before.
  sync.discard()
  sync.close()
  const demo = makeDemoData(now)
  useScheduleStore.setState({ courses: demo.courses, sessions: demo.sessions })
  useTaskStore.setState({ tasks: demo.tasks })
  useNoteStore.setState({ notes: demo.notes })
  useGradeStore.setState({ components: demo.components, overrides: {}, targets: {}, prior: { cgpa: null, units: null } })
  useSettingsStore.setState({ name: '', isDemo: true, bannerDismissed: false })
  useAuthStore.setState({ account: null, guest: true })
  useThemeStore.setState({ family: 'matcha', theme: 'light' })
  delete document.documentElement.dataset.theme
  useUiStore.setState({
    dialog: null,
    appearanceOpen: false,
    drawerSessionId: null,
    taskCourse: '',
    selectedNoteId: null,
    flashTaskId: null,
    toast: null,
  })
  window.location.hash = ''
}
