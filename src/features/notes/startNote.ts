import type { ClassSession } from '@/types'
import { navigate } from '@/lib/route'
import { dateKey, formatShortDate, parseDateKey } from '@/lib/time'
import { latestMeetingOnOrBefore } from '@/features/schedule/scheduleUtils'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * Opens the note for a class meeting, creating it the first time.
 * "Meeting" means the most recent day the session met, up to today.
 */
export function openNoteForSession(session: ClassSession, now: Date): void {
  const date = dateKey(latestMeetingOnOrBefore(session, now) ?? now)
  const notes = useNoteStore.getState()
  const existing = notes.notes.find((n) => n.sessionId === session.id && n.sessionDate === date)
  const course = useScheduleStore.getState().courses.find((c) => c.id === session.courseId)
  const id =
    existing?.id ??
    notes.addNote({
      title: `${course?.code ?? 'Class'}, ${formatShortDate(parseDateKey(date))}`,
      courseId: session.courseId,
      sessionId: session.id,
      sessionDate: date,
    })
  const ui = useUiStore.getState()
  ui.selectNote(id)
  ui.closeDrawer()
  navigate('notes')
}
