import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import type { Course } from '@/types'
import { Button, IconButton } from '@/components/ui/Button'
import { CheckButton } from '@/components/ui/CheckButton'
import { cn } from '@/lib/cn'
import { dateKey, formatClock, formatDuration, formatRange } from '@/lib/time'
import { useTaskStore } from '@/store/useTaskStore'
import { conflictsOn, freePeriods, longDay, type DayItems, type Span } from './calendarModel'
import { TaskMarker } from './events'

const span = (s: Span) => `${formatClock(s.start)} to ${formatClock(s.end)}`

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h3 className="text-[10.5px] font-semibold tracking-[0.08em] text-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

/**
 * One day in detail, beside the calendar: its classes, what is due, the free time between
 * classes, and anything that clashes. Closes with its button or Escape.
 */
export function DayPanel({
  day,
  now,
  items,
  courses,
  onClose,
  onTask,
  onClass,
  onAdd,
  onWeek,
}: {
  day: Date
  now: Date
  items: DayItems
  courses: Map<string, Course>
  onClose: () => void
  onTask: (id: string, el: HTMLElement) => void
  onClass: (id: string, el: HTMLElement) => void
  onAdd: (el: HTMLElement) => void
  /** In the month view: show this day's week. */
  onWeek?: () => void
}) {
  const toggleTask = useTaskStore((s) => s.toggleTask)
  const heading = useRef<HTMLHeadingElement>(null)
  const key = dateKey(day)
  // Focus follows the day that was picked, so keyboard and screen reader users land on it.
  useEffect(() => heading.current?.focus(), [key])

  const tasks = [...items.deadlines.map((task) => ({ task, time: null as number | null })), ...items.timed.map(({ task, minutes }) => ({ task, time: minutes as number | null }))]
  const free = freePeriods(items)
  const clashes = conflictsOn(items)
  const nameOf = (id: string) => {
    const s = items.classes.find((c) => c.id === id)
    if (s) return courses.get(s.courseId)?.code ?? 'A class'
    return items.timed.find((t) => t.task.id === id)?.task.title ?? 'An exam'
  }
  const relative = key === dateKey(now) ? 'Today' : null
  const row = 'flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-left text-[13px] hover:bg-fill'

  return (
    <aside
      aria-labelledby="day-panel-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="flex flex-col gap-5 rounded-xl border border-line bg-surface p-5 motion-safe:animate-[fade-in_.2s_var(--ease-apple)] xl:sticky xl:top-4 xl:max-h-[calc(100svh-2rem)] xl:overflow-y-auto"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {relative ? <p className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">{relative}</p> : null}
          <h2 id="day-panel-title" ref={heading} tabIndex={-1} className="text-[17px] font-semibold tracking-[-0.01em] outline-none">
            {longDay(day)}
          </h2>
        </div>
        <IconButton label="Close day details" onClick={onClose} className="-mt-1 -mr-1.5">
          <X className="size-4" aria-hidden="true" />
        </IconButton>
      </div>

      {clashes.length > 0 ? (
        <Section title="Clashes">
          {clashes.map((c) => (
            <p key={`${c.a}-${c.b}`} className="px-2 text-[13px] text-warn">
              {nameOf(c.a)} and {nameOf(c.b)} overlap, {span(c.span)}
            </p>
          ))}
        </Section>
      ) : null}

      <Section title="Classes">
        {items.classes.length === 0 ? (
          <p className="px-2 text-[13px] text-muted">No classes.</p>
        ) : (
          <ul className="-mx-0 flex flex-col">
            {items.classes.map((s) => {
              const course = courses.get(s.courseId)
              return (
                <li key={s.id}>
                  <button type="button" className={row} onClick={(e) => onClass(s.id, e.currentTarget)}>
                    <i className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: course?.color }} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{course?.code ?? 'Class'}</span>
                      <span className="block truncate text-[12px] text-muted tabular-nums">
                        {formatRange(s.start, s.end)}
                        {s.room ? ` · ${s.room}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {free.length > 0 ? (
        <Section title="Free between classes">
          {free.map((f) => (
            <p key={f.start} className="flex justify-between gap-3 px-2 text-[13px]">
              <span className="tabular-nums">{span(f)}</span>
              <span className="text-muted">{formatDuration(f.end - f.start)}</span>
            </p>
          ))}
        </Section>
      ) : null}

      <Section title="Due">
        {tasks.length === 0 ? (
          <p className="px-2 text-[13px] text-muted">Nothing due.</p>
        ) : (
          <ul className="flex flex-col">
            {tasks.map(({ task, time }) => {
              const course = task.courseId ? courses.get(task.courseId) : undefined
              return (
                <li key={task.id} className="flex items-center gap-1 pl-1">
                  <CheckButton checked={task.done} onChange={() => toggleTask(task.id)} label={task.done ? `Mark not done: ${task.title}` : `Mark done: ${task.title}`} />
                  <button type="button" className={cn(row, task.done && 'text-muted')} onClick={(e) => onTask(task.id, e.currentTarget)}>
                    <TaskMarker task={task} color={course?.color} />
                    <span className={cn('min-w-0 flex-1 truncate', task.done && 'line-through', task.category === 'exam' && !task.done && 'font-semibold')}>{task.title}</span>
                    {time !== null ? <span className="shrink-0 text-[12px] text-muted tabular-nums">{formatClock(time)}</span> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <div className="mt-auto flex flex-wrap gap-2">
        <Button size="sm" onClick={(e) => onAdd(e.currentTarget)}>
          Add task
        </Button>
        {onWeek ? (
          <Button size="sm" variant="subtle" onClick={onWeek}>
            Show week
          </Button>
        ) : null}
      </div>
    </aside>
  )
}

