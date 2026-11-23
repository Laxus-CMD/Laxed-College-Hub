import { makeDemoData } from '@/data/demo'
import type { GradeComponent } from '@/types'
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

/** A grade component that was just removed, with where it was, so Undo can put it back exactly. */
export interface RemovedComponent {
  component: GradeComponent
  index: number
}

/** Removes one grade component and hands back everything needed to undo it. */
export function deleteComponent(id: string): RemovedComponent | null {
  const { components } = useGradeStore.getState()
  const index = components.findIndex((c) => c.id === id)
  const component = components[index]
  if (!component) return null
  useGradeStore.getState().removeComponent(id)
  return { component, index }
}

/** Puts a removed component back in its place, with its score, total and weight, without touching anything edited since. */
export function restoreComponent({ component, index }: RemovedComponent): void {
  useGradeStore.setState((s) => {
    if (s.components.some((c) => c.id === component.id)) return s
    const next = [...s.components]
    next.splice(Math.min(index, next.length), 0, component)
    return { components: next }
  })
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
