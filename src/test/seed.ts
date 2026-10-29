import { makeDemoData } from '@/data/demo'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

/** Puts every store back to the demo data for a given moment. Used by tests. */
export function resetStores(now: Date): void {
  const demo = makeDemoData(now)
  useScheduleStore.setState({ courses: demo.courses, sessions: demo.sessions })
  useTaskStore.setState({ tasks: demo.tasks })
  useNoteStore.setState({ notes: demo.notes })
  useGradeStore.setState({ components: demo.components, overrides: {}, targets: {}, prior: { cgpa: null, units: null } })
  useSettingsStore.setState({ name: '', isDemo: true, bannerDismissed: false })
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
