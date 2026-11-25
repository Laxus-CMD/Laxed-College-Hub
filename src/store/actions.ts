import { fieldsForStage, stageLabel, stageOf, type Stage } from '@/lib/stage'
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

/**
 * Ends the term on `lastDay` ("YYYY-MM-DD"): every class meeting then stops after it, and keeps
 * its past meetings on the calendar. Classes of a later term are left alone. Returns how many ended.
 */
export function endTerm(lastDay: string): number {
  const { sessions, updateSession } = useScheduleStore.getState()
  const running = sessions.filter((s) => (!s.endsOn || s.endsOn > lastDay) && (!s.startsOn || s.startsOn <= lastDay))
  const was = new Map(running.map((s) => [s.id, s.endsOn ?? null]))
  for (const s of running) updateSession(s.id, { endsOn: lastDay })
  if (running.length > 0) {
    useUiStore.getState().showToast({
      message: `Term ended. ${running.length === 1 ? 'Its class stays' : 'Its classes stay'} on the calendar for the weeks ${running.length === 1 ? 'it' : 'they'} met.`,
      // Puts back only the end dates this changed, on classes that still exist; anything edited since stays.
      undo: () => {
        const { sessions: now, updateSession: update } = useScheduleStore.getState()
        for (const s of now) if (was.has(s.id) && s.endsOn === lastDay) update(s.id, { endsOn: was.get(s.id) })
      },
    })
  }
  return running.length
}

/**
 * Moves a task to a new due date or time, as a drag on the calendar does. Undo puts back only
 * that task's previous due value, so anything done in between (another task finished, a note
 * written) stays as it is. If the task was deleted or moved again meanwhile, Undo leaves it.
 */
export function rescheduleTask(taskId: string, due: string, message: string): void {
  const { tasks, updateTask } = useTaskStore.getState()
  const task = tasks.find((t) => t.id === taskId)
  if (!task || task.due === due) return
  const previous = task.due
  updateTask(taskId, { due })
  useUiStore.getState().showToast({
    message,
    undo: () => {
      const now = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      if (now && now.due === due) useTaskStore.getState().updateTask(taskId, { due: previous })
    },
  })
}

/** Moves a task to another Flow stage, with Undo. Nothing happens if it is already there. */
export function moveTaskToStage(taskId: string, stage: Stage): void {
  const { tasks, updateTask } = useTaskStore.getState()
  const task = tasks.find((t) => t.id === taskId)
  if (!task || stageOf(task) === stage) return
  const before = { done: task.done, progress: task.progress ?? null }
  updateTask(taskId, fieldsForStage(stage))
  useUiStore.getState().showToast({
    message: `Moved to ${stageLabel(stage)}.`,
    undo: () => {
      // Only if nothing else has moved it since.
      const now = useTaskStore.getState().tasks.find((t) => t.id === taskId)
      if (now && stageOf(now) === stage) useTaskStore.getState().updateTask(taskId, before)
    },
  })
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
