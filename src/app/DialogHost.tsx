import { IcsDialog } from '@/features/assignments/IcsImport'
import { TaskDialog } from '@/features/assignments/TaskDialog'
import { ClassDrawer } from '@/features/schedule/ClassDrawer'
import { CourseDialog } from '@/features/schedule/CourseDialog'
import { SessionDialog } from '@/features/schedule/SessionDialog'
import { SettingsDialog } from '@/app/SettingsDialog'
import { useUiStore } from '@/store/useUiStore'

/** Renders whichever dialog or drawer is open. State lives in the UI store so any page can open them. */
export function DialogHost() {
  const dialog = useUiStore((s) => s.dialog)
  const drawerId = useUiStore((s) => s.drawerSessionId)

  return (
    <>
      {drawerId ? <ClassDrawer key={drawerId} sessionId={drawerId} /> : null}
      {dialog?.type === 'task' ? <TaskDialog key={`task-${dialog.id ?? 'new'}`} id={dialog.id} courseId={dialog.courseId} /> : null}
      {dialog?.type === 'course' ? <CourseDialog key={`course-${dialog.id ?? 'new'}`} id={dialog.id} /> : null}
      {dialog?.type === 'session' ? (
        <SessionDialog key={`session-${dialog.id ?? 'new'}`} id={dialog.id} preset={dialog.preset} />
      ) : null}
      {dialog?.type === 'settings' ? <SettingsDialog /> : null}
      {dialog?.type === 'ics' ? <IcsDialog /> : null}
    </>
  )
}
