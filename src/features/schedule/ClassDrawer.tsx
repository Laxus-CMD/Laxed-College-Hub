import { FileText, MapPin, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CourseChip } from '@/components/ui/Chip'
import { Dialog } from '@/components/ui/Dialog'
import { navigate } from '@/lib/route'
import { dateKey, formatRange, parseDateKey, WEEK_ORDER, WEEKDAY_SHORT } from '@/lib/time'
import { useNow } from '@/lib/useNow'
import { dueLabel } from '@/features/assignments/urgency'
import { latestMeetingOnOrBefore } from '@/features/schedule/scheduleUtils'
import { openNoteForSession } from '@/features/notes/startNote'
import { deleteSession } from '@/store/actions'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

/** Side panel with everything about one class: time, room, professor, notes and open work. */
export function ClassDrawer({ sessionId }: { sessionId: string }) {
  const now = useNow()
  const close = useUiStore((s) => s.closeDrawer)
  const openDialog = useUiStore((s) => s.openDialog)
  const selectNote = useUiStore((s) => s.selectNote)
  const session = useScheduleStore((s) => s.sessions.find((x) => x.id === sessionId))
  const course = useScheduleStore((s) => s.courses.find((c) => c.id === session?.courseId))
  const notes = useNoteStore((s) => s.notes)
  const tasks = useTaskStore((s) => s.tasks)

  if (!session) return null

  const linked = notes
    .filter((n) => n.sessionId === session.id)
    .sort((a, b) => (b.sessionDate ?? '').localeCompare(a.sessionDate ?? ''))
  const meeting = latestMeetingOnOrBefore(session, now) ?? now
  const hasToday = linked.some((n) => n.sessionDate === dateKey(meeting))
  const open = tasks
    .filter((t) => !t.done && t.courseId === session.courseId)
    .slice(0, 3)
  const days = [...session.days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))

  return (
    <Dialog title={course?.code ?? 'Class'} onClose={close} variant="drawer">
      <p className="-mt-2 mb-4 text-muted">{course?.name}</p>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs text-faint">When</dt>
          <dd>
            {days.map((d) => WEEKDAY_SHORT[d]).join(', ')}, {formatRange(session.start, session.end)}
          </dd>
        </div>
        {session.room || session.building ? (
          <div>
            <dt className="text-xs text-faint">Where</dt>
            <dd className="flex items-center gap-1.5">
              <MapPin className="size-4 text-muted" aria-hidden="true" />
              {[session.room, session.building].filter(Boolean).join(', ')}
            </dd>
          </div>
        ) : null}
        {course?.professor ? (
          <div>
            <dt className="text-xs text-faint">Professor</dt>
            <dd>
              {course.professor}
              {course.professorEmail ? <span className="block text-xs text-muted">{course.professorEmail}</span> : null}
            </dd>
          </div>
        ) : null}
        {course?.officeHours ? (
          <div>
            <dt className="text-xs text-faint">Office hours</dt>
            <dd>{course.officeHours}</dd>
          </div>
        ) : null}
      </dl>

      <section className="mt-6" aria-label="Notes for this class">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Notes for this class</h3>
          <Button size="sm" variant="primary" onClick={() => openNoteForSession(session, now)}>
            <FileText className="size-4" aria-hidden="true" />
            {hasToday ? 'Open latest note' : 'New note'}
          </Button>
        </div>
        {linked.length === 0 ? (
          <p className="text-[13px] text-muted">No notes yet. A note stays linked to the day you took it.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {linked.slice(0, 5).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectNote(n.id)
                    close()
                    navigate('notes')
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2 text-left hover:bg-white/5"
                >
                  <span className="truncate text-sm">{n.title || 'Untitled note'}</span>
                  <span className="shrink-0 text-xs text-muted">
                    {n.sessionDate ? parseDateKey(n.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open.length > 0 ? (
        <section className="mt-6" aria-label="Open work">
          <h3 className="mb-2 text-sm font-medium">Open work for this course</h3>
          <ul className="flex flex-col gap-1.5">
            {open.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate">{t.title}</span>
                <span className="shrink-0 text-xs text-muted">{dueLabel(t, now).text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-2.5">
        {course ? <CourseChip course={course} /> : null}
        <span className="flex-1" />
        <Button
          onClick={() => {
            close()
            openDialog({ type: 'session', id: session.id })
          }}
        >
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </Button>
        <Button variant="danger" onClick={() => deleteSession(session.id)}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </Button>
      </div>
      {course ? (
        <button
          type="button"
          className="mt-4 cursor-pointer text-[13px] text-accent hover:underline"
          onClick={() => {
            close()
            openDialog({ type: 'course', id: course.id })
          }}
        >
          Edit course details
        </button>
      ) : null}
    </Dialog>
  )
}
