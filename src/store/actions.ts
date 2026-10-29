import { makeDemoData } from '@/data/demo'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

/** Everything the app saves, captured so a delete can be undone. */
export interface Snapshot {
  schedule: Pick<ReturnType<typeof useScheduleStore.getState>, 'courses' | 'sessions'>
  tasks: ReturnType<typeof useTaskStore.getState>['tasks']
  notes: ReturnType<typeof useNoteStore.getState>['notes']
  grades: Pick<
    ReturnType<typeof useGradeStore.getState>,
    'components' | 'scale' | 'overrides' | 'targets' | 'prior'
  >
  settings: Pick<ReturnType<typeof useSettingsStore.getState>, 'isDemo' | 'bannerDismissed'>
}

export function takeSnapshot(): Snapshot {
  const sc = useScheduleStore.getState()
  const gr = useGradeStore.getState()
  const se = useSettingsStore.getState()
  return {
    schedule: { courses: sc.courses, sessions: sc.sessions },
    tasks: useTaskStore.getState().tasks,
    notes: useNoteStore.getState().notes,
    grades: {
      components: gr.components,
      scale: gr.scale,
      overrides: gr.overrides,
      targets: gr.targets,
      prior: gr.prior,
    },
    settings: { isDemo: se.isDemo, bannerDismissed: se.bannerDismissed },
  }
}

export function restoreSnapshot(snap: Snapshot): void {
  useScheduleStore.setState(snap.schedule)
  useTaskStore.setState({ tasks: snap.tasks })
  useNoteStore.setState({ notes: snap.notes })
  useGradeStore.setState(snap.grades)
  useSettingsStore.setState(snap.settings)
}

/** Shows a toast with an Undo button that puts everything back as it was. */
export function toastWithUndo(message: string, before: Snapshot): void {
  useUiStore.getState().showToast({ message, undo: () => restoreSnapshot(before) })
}

export function deleteCourse(courseId: string): void {
  const before = takeSnapshot()
  useScheduleStore.getState().removeCourse(courseId)
  useTaskStore.getState().unlinkCourse(courseId)
  useNoteStore.getState().unlinkCourse(courseId)
  useGradeStore.getState().removeCourse(courseId)
  const ui = useUiStore.getState()
  if (ui.taskCourse === courseId) ui.setTaskCourse('')
  toastWithUndo('Course deleted.', before)
}

export function deleteSession(sessionId: string): void {
  const before = takeSnapshot()
  useScheduleStore.getState().removeSession(sessionId)
  useNoteStore.getState().unlinkSession(sessionId)
  const ui = useUiStore.getState()
  if (ui.drawerSessionId === sessionId) ui.closeDrawer()
  toastWithUndo('Class deleted.', before)
}

export function deleteTask(taskId: string): void {
  const before = takeSnapshot()
  useTaskStore.getState().removeTask(taskId)
  toastWithUndo('Task deleted.', before)
}

export function deleteNote(noteId: string): void {
  const before = takeSnapshot()
  useNoteStore.getState().removeNote(noteId)
  const ui = useUiStore.getState()
  if (ui.selectedNoteId === noteId) ui.selectNote(null)
  toastWithUndo('Note deleted.', before)
}

/** Empties every store. Name and grading scale stay. */
export function clearAllData(): void {
  const before = takeSnapshot()
  useScheduleStore.setState({ courses: [], sessions: [] })
  useTaskStore.setState({ tasks: [] })
  useNoteStore.setState({ notes: [] })
  useGradeStore.setState({ components: [], overrides: {}, targets: {}, prior: { cgpa: null, units: null } })
  useSettingsStore.getState().setDemo(false)
  const ui = useUiStore.getState()
  ui.setTaskCourse('')
  ui.selectNote(null)
  ui.closeDrawer()
  toastWithUndo('Sample data cleared.', before)
}

export function loadDemoData(): void {
  const before = takeSnapshot()
  const demo = makeDemoData(new Date())
  useScheduleStore.setState({ courses: demo.courses, sessions: demo.sessions })
  useTaskStore.setState({ tasks: demo.tasks })
  useNoteStore.setState({ notes: demo.notes })
  useGradeStore.setState({ components: demo.components, overrides: {}, targets: {} })
  useSettingsStore.getState().setDemo(true)
  toastWithUndo('Sample data restored.', before)
}
