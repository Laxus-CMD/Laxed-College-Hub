import { useMemo, useState, type FormEvent } from 'react'
import type { Weekday } from '@/types'
import { Button } from '@/components/ui/Button'
import { Choice, ChoiceGroup, Input, Label, Select } from '@/components/ui/Field'
import { Dialog } from '@/components/ui/Dialog'
import { toMinutes, WEEK_ORDER, WEEKDAY_SHORT } from '@/lib/time'
import { findConflicts } from '@/features/schedule/scheduleUtils'
import { deleteSession } from '@/store/actions'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore, type DialogState } from '@/store/useUiStore'

type SessionDialogState = Extract<NonNullable<DialogState>, { type: 'session' }>

/** Add or edit a class. A new class can meet on several days at once. */
export function SessionDialog({ id, preset }: Pick<SessionDialogState, 'id' | 'preset'>) {
  const close = useUiStore((s) => s.closeDialog)
  const openDialog = useUiStore((s) => s.openDialog)
  const courses = useScheduleStore((s) => s.courses)
  const sessions = useScheduleStore((s) => s.sessions)
  const addSession = useScheduleStore((s) => s.addSession)
  const updateSession = useScheduleStore((s) => s.updateSession)
  const existing = sessions.find((s) => s.id === id)

  const [today] = useState(() => new Date().getDay() as Weekday)
  const [courseId, setCourseId] = useState(existing?.courseId ?? preset?.courseId ?? courses[0]?.id ?? '')
  const [days, setDays] = useState<Weekday[]>(existing?.days ?? preset?.days ?? [today === 0 ? 1 : today])
  const [start, setStart] = useState(existing?.start ?? preset?.start ?? '08:00')
  const [end, setEnd] = useState(existing?.end ?? preset?.end ?? '09:30')
  const [room, setRoom] = useState(existing?.room ?? '')
  const [building, setBuilding] = useState(existing?.building ?? '')
  const [error, setError] = useState('')

  const conflicts = useMemo(
    () => findConflicts(sessions, { days, start, end }, id),
    [sessions, days, start, end, id],
  )
  const courseOf = (cid: string) => courses.find((c) => c.id === cid)

  if (courses.length === 0) {
    return (
      <Dialog title="Add class" onClose={close}>
        <p className="mb-4 text-muted">Add a course first, then schedule its meetings.</p>
        <div className="flex justify-end gap-2.5">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={() => openDialog({ type: 'course' })}>
            Add course
          </Button>
        </div>
      </Dialog>
    )
  }

  const toggleDay = (d: Weekday) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!courseId) return setError('Pick a course first.')
    if (days.length === 0) return setError('Choose at least one day.')
    if (!start || !end) return setError('Set a start and end time.')
    if (toMinutes(end) <= toMinutes(start)) return setError('End time must be after the start time.')
    const data = {
      courseId,
      days: [...days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)),
      start,
      end,
      room: room.trim() || undefined,
      building: building.trim() || undefined,
    }
    if (existing) updateSession(existing.id, data)
    else addSession(data)
    close()
  }

  return (
    <Dialog title={existing ? 'Edit class' : 'Add class'} onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Label label="Course">
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}: {c.name}
              </option>
            ))}
          </Select>
        </Label>
        <ChoiceGroup legend="Days it meets" className="gap-1.5">
          {WEEK_ORDER.map((d) => (
            <Choice
              key={d}
              type="checkbox"
              name="days"
              value={String(d)}
              checked={days.includes(d)}
              onChange={() => toggleDay(d)}
              className="w-[54px] px-0 text-center"
            >
              {WEEKDAY_SHORT[d]}
            </Choice>
          ))}
        </ChoiceGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Starts">
            <Input type="time" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Label>
          <Label label="Ends">
            <Input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Room">
            <Input maxLength={40} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="For example, UH 310" />
          </Label>
          <Label label="Building (optional)">
            <Input maxLength={60} value={building} onChange={(e) => setBuilding(e.target.value)} />
          </Label>
        </div>
        {conflicts.length > 0 ? (
          <p role="status" className="text-[13px] text-warn">
            This overlaps with{' '}
            {conflicts.map((c) => `${courseOf(c.session.courseId)?.code ?? 'a class'} on ${WEEKDAY_SHORT[c.day]}`).join(', ')}. You
            can still save it.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] text-bad">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {existing ? (
            <Button
              variant="danger"
              onClick={() => {
                close()
                deleteSession(existing.id)
              }}
            >
              Delete
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existing ? 'Save class' : 'Add class'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
