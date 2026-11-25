import { useState, type FormEvent, type ReactNode } from 'react'
import { CalendarDays, Clock, MapPin, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CheckButton } from '@/components/ui/CheckButton'
import { Input, Label, Select } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { dateKey, formatClock, formatRange, parseDateKey, toMinutes } from '@/lib/time'
import { endTerm, deleteTask } from '@/store/actions'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { fieldsOf, TASK_TYPES, typeOf, type TaskType } from '@/features/assignments/taskType'
import { dueParts, shortDay } from './calendarModel'


function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[13px] text-muted">
      <span className="mt-0.5 shrink-0 text-faint" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** A task from the To-Do List, edited in place. Every change is the same as making it there. */
export function TaskDetails({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  const updateTask = useTaskStore((s) => s.updateTask)
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const courses = useScheduleStore((s) => s.courses)
  const openDialog = useUiStore((s) => s.openDialog)
  const [title, setTitle] = useState(task?.title ?? '')

  if (!task) return <p className="text-[13px] text-muted">This task was deleted.</p>
  const due = dueParts(task)
  const setDue = (date: string, time: string | null | undefined) => updateTask(id, { due: date ? `${date}T${time || '23:59'}` : undefined })
  // Saved as it is typed, so closing the panel any way (Escape, a press outside) keeps the new
  // name. An empty name is never saved: leaving the field empty puts the last name back.
  const rename = (value: string) => {
    setTitle(value)
    const trimmed = value.trim()
    if (trimmed && trimmed !== task.title) updateTask(id, { title: trimmed })
  }
  const commit = () => {
    if (!title.trim()) setTitle(task.title)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <span className="pt-1">
          <CheckButton checked={task.done} onChange={() => toggleTask(id)} label={task.done ? `Mark not done: ${task.title}` : `Mark done: ${task.title}`} />
        </span>
        {/* Wraps instead of scrolling, so a long name is readable. Enter saves; pasted line breaks become spaces. */}
        <textarea
          aria-label="Task name"
          rows={1}
          maxLength={140}
          value={title}
          onChange={(e) => rename(e.target.value.replace(/\s*\n\s*/g, ' '))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          className={cn(
            'field-sizing-content min-w-0 flex-1 resize-none rounded-lg bg-transparent px-1.5 py-1 text-[15px] leading-snug font-semibold outline-none focus:bg-fill',
            task.done && 'text-muted line-through',
          )}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-2.5">
        <Label label="Due">
          <Input type="date" value={due?.date ?? ''} onChange={(e) => setDue(e.target.value, due?.time)} />
        </Label>
        <Label label="Time">
          <Input type="time" value={due?.time ?? ''} disabled={!due} onChange={(e) => setDue(due?.date ?? '', e.target.value || null)} />
        </Label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-2.5">
        <Label label="Type">
          <Select value={typeOf(task)} onChange={(e) => updateTask(id, fieldsOf(e.target.value as TaskType))}>
            {TASK_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Label>
      <Label label="Course">
        <Select value={task.courseId ?? ''} onChange={(e) => updateTask(id, { courseId: e.target.value || undefined })}>
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
      </Label>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <Button
          size="sm"
          variant="danger"
          onClick={() => {
            onClose()
            deleteTask(id)
          }}
        >
          Delete
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          onClick={() => {
            onClose()
            openDialog({ type: 'task', id })
          }}
        >
          More options
        </Button>
      </div>
    </div>
  )
}

/** A new task for the To-Do List, due on a day, and at a time when one was picked. */
export function NewTask({ date, time, onClose, onAddClass }: { date: string; time: string | null; onClose: () => void; onAddClass?: () => void }) {
  const addTask = useTaskStore((s) => s.addTask)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('todo')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    addTask({ ...fieldsOf(type), title: trimmed, due: `${date}T${time ?? '23:59'}` })
    onClose()
  }
  const when = `${shortDay(parseDateKey(date))}${time ? ` at ${formatClock(toMinutes(time))}` : ''}`
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input data-autofocus aria-label="Task name" placeholder="New task" maxLength={140} value={title} onChange={(e) => setTitle(e.target.value)} />
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Type</legend>
        <div className="grid grid-cols-3 gap-1 rounded-[9px] bg-fill p-[3px]">
          {[TASK_TYPES[2]!, TASK_TYPES[0]!, TASK_TYPES[1]!].map((t) => (
            <label key={t.id} className="relative">
              <input type="radio" name="new-task-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="peer absolute inset-0 m-0 cursor-pointer opacity-0" />
              <span className="flex h-7 items-center justify-center rounded-[6px] text-[12.5px] font-medium text-muted transition-colors peer-checked:bg-thumb peer-checked:text-ink peer-checked:shadow-thumb peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {t.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Detail icon={<CalendarDays className="size-4" />}>Due {when}</Detail>
      <div className="flex items-center gap-2">
        {onAddClass ? (
          <Button size="sm" variant="subtle" className="-ml-2" onClick={onAddClass}>
            Add a class instead
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button size="sm" type="submit" variant="primary" disabled={!title.trim()}>
          Add task
        </Button>
      </div>
    </form>
  )
}

/** A class meeting: what, when, where, and the way to its notes. */
export function ClassDetails({ id, date, today, onClose }: { id: string; date: string; today: Date; onClose: () => void }) {
  const session = useScheduleStore((s) => s.sessions.find((x) => x.id === id))
  const course = useScheduleStore((s) => s.courses.find((c) => c.id === session?.courseId))
  const openDrawer = useUiStore((s) => s.openDrawer)
  const openDialog = useUiStore((s) => s.openDialog)
  if (!session) return <p className="text-[13px] text-muted">This class was deleted.</p>
  const place = [session.room, session.building].filter(Boolean).join(', ')
  const ended = session.endsOn && session.endsOn < dateKey(today)
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <i className="size-2.5 shrink-0 rounded-full" style={{ background: course?.color }} aria-hidden="true" />
          {course?.code ?? 'Class'}
        </p>
        {course?.name ? <p className="mt-0.5 text-[13px] text-muted">{course.name}</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Detail icon={<Clock className="size-4" />}>
          {shortDay(parseDateKey(date))} · {formatRange(session.start, session.end)}
        </Detail>
        {place ? <Detail icon={<MapPin className="size-4" />}>{place}</Detail> : null}
        {course?.professor ? <Detail icon={<User className="size-4" />}>{course.professor}</Detail> : null}
        {session.endsOn ? (
          <Detail icon={<CalendarDays className="size-4" />}>
            {ended ? 'Term ended' : 'Last class'} {shortDay(parseDateKey(session.endsOn))}
          </Detail>
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          className="-ml-2"
          onClick={() => {
            onClose()
            openDialog({ type: 'session', id })
          }}
        >
          Edit class
        </Button>
        <span className="flex-1" />
        <Button
          size="sm"
          onClick={() => {
            onClose()
            openDrawer(id)
          }}
        >
          Notes and details
        </Button>
      </div>
    </div>
  )
}

/** Ends the current term on a chosen day, keeping its classes on the calendar for the weeks they met. */
export function EndTerm({ onClose, today }: { onClose: () => void; today: Date }) {
  const sessions = useScheduleStore((s) => s.sessions)
  const [day, setDay] = useState(dateKey(today))
  const running = sessions.filter((s) => (!s.endsOn || s.endsOn > day) && (!s.startsOn || s.startsOn <= day))
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        endTerm(day)
        onClose()
      }}
    >
      <h3 className="text-[15px] font-semibold">End this term</h3>
      <p className="text-[13px] text-muted">
        Your classes stop after the last day and stay on the calendar for the weeks they met. Then add next term&apos;s classes.
      </p>
      <Label label="Last day of the term">
        <Input data-autofocus type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
      </Label>
      <p className="text-[13px] text-muted" role="status">
        {running.length === 0 ? 'No classes are running on that day.' : `${running.length} ${running.length === 1 ? 'class ends' : 'classes end'} on ${shortDay(parseDateKey(day || dateKey(today)))}.`}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" disabled={running.length === 0 || !day}>
          End term
        </Button>
      </div>
    </form>
  )
}
