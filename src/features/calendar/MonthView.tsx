import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { ClassSession, Course, Task } from '@/types'
import { cn } from '@/lib/cn'
import { dateKey, formatClock, toMinutes } from '@/lib/time'
import { dayItems, itemCount, longDay, type DayItems } from './calendarModel'
import { ClassInfo, DraggableTask, TaskMarker } from './events'
import { taskLabel, useHoverDetails } from './eventStyle'
import type { ViewHandlers } from './WeekView'

/** Items shown in a day before "N more". */
const SHOWN = 3

/** A month: one cell a day, with its deadlines first, then timed tasks, then classes. */
export function MonthView({
  weeks,
  month,
  now,
  sessions,
  byDate,
  courses,
  selected,
  handlers,
}: {
  weeks: Date[][]
  /** The month shown; days from the months around it are quieter. */
  month: number
  now: Date
  sessions: ClassSession[]
  byDate: Map<string, Task[]>
  courses: Map<string, Course>
  selected: string | null
  handlers: ViewHandlers
}) {
  const todayKey = dateKey(now)
  const cols = { gridTemplateColumns: `repeat(${weeks[0]?.length ?? 7}, minmax(0, 1fr))` }
  return (
    <div className="@container overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid border-b border-line" style={cols}>
        {(weeks[0] ?? []).map((d) => (
          <div key={d.getDay()} className="px-3 py-2.5 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">
            {d.toLocaleDateString('en-US', { weekday: 'short' })}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={dateKey(week[0]!)} className="grid border-b border-line last:border-b-0" style={cols}>
          {week.map((day) => (
            <DayCell
              key={dateKey(day)}
              day={day}
              items={dayItems(day, sessions, byDate)}
              courses={courses}
              today={dateKey(day) === todayKey}
              selected={selected === dateKey(day)}
              outside={day.getMonth() !== month}
              handlers={handlers}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function DayCell({
  day,
  items,
  courses,
  today,
  selected,
  outside,
  handlers,
}: {
  day: Date
  items: DayItems
  courses: Map<string, Course>
  today: boolean
  selected: boolean
  outside: boolean
  handlers: ViewHandlers
}) {
  const key = dateKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: `month:${key}`, data: { date: key, kind: 'month' } })
  const total = itemCount(items)
  const entries: { key: string; node: ReactNode }[] = [
    ...items.deadlines.map((t) => ({ key: t.id, node: <TaskLine task={t} time={null} course={t.courseId ? courses.get(t.courseId) : undefined} handlers={handlers} /> })),
    ...items.timed.map(({ task: t, minutes }) => ({ key: t.id, node: <TaskLine task={t} time={formatClock(minutes)} course={t.courseId ? courses.get(t.courseId) : undefined} handlers={handlers} /> })),
    ...items.classes.map((s) => ({ key: s.id, node: <ClassLine session={s} course={courses.get(s.courseId)} day={day} handlers={handlers} /> })),
  ]
  const shown = total > SHOWN ? entries.slice(0, SHOWN - 1) : entries
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`${longDay(day)}${total ? `, ${total} ${total === 1 ? 'item' : 'items'}` : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) handlers.onNew(key, null, e.currentTarget)
      }}
      className={cn(
        'relative flex min-h-[6.25rem] min-w-0 cursor-cell flex-col gap-0.5 border-l border-line p-1.5 transition-colors first:border-l-0 @3xl:min-h-[7.25rem] @3xl:p-2',
        today && 'bg-accent-fill/[0.045]',
        selected && 'bg-fill',
        isOver && 'bg-accent-fill/[0.08]',
      )}
    >
      <button
        type="button"
        onClick={() => handlers.onDay(day)}
        aria-label={`${longDay(day)}, details`}
        aria-current={today ? 'date' : undefined}
        aria-pressed={selected}
        className={cn(
          'mb-0.5 grid h-7 min-w-7 shrink-0 cursor-pointer place-items-center self-start rounded-full px-1 text-[13px] font-semibold tabular-nums transition-colors hover:bg-fill-strong',
          outside && 'font-normal text-faint',
          today && 'bg-accent-fill text-on-accent hover:bg-accent-hover',
        )}
      >
        {day.getDate()}
      </button>
      {/* Wide: the items themselves. */}
      <ul className="hidden min-w-0 flex-col gap-0.5 @2xl:flex">
        {shown.map((e) => (
          <li key={e.key} className="min-w-0">
            {e.node}
          </li>
        ))}
      </ul>
      {total > shown.length ? (
        <button
          type="button"
          onClick={() => handlers.onDay(day)}
          className="hidden cursor-pointer self-start rounded-[6px] px-1.5 py-0.5 text-[11.5px] font-medium text-muted hover:bg-fill hover:text-ink @2xl:block"
        >
          {total - shown.length} more
        </button>
      ) : null}
      {/* Narrow: a dot per item, and the day opens in the panel. */}
      {total > 0 ? (
        <button
          type="button"
          onClick={() => handlers.onDay(day)}
          aria-label={`${longDay(day)}: ${total} ${total === 1 ? 'item' : 'items'}`}
          className="flex flex-wrap gap-1 px-1 pt-0.5 pb-1 @2xl:hidden"
        >
          {[...items.deadlines, ...items.timed.map((t) => t.task)].slice(0, 4).map((t) => (
            <i
              key={t.id}
              className={cn('size-1.5 rounded-full', t.category === 'exam' && 'rotate-45 rounded-[1px]', t.done && 'opacity-40')}
              style={{ background: (t.courseId && courses.get(t.courseId)?.color) || 'var(--color-ink)' }}
              aria-hidden="true"
            />
          ))}
          {items.classes.slice(0, 4).map((s) => (
            <i key={s.id} className="size-1.5 rounded-full opacity-45" style={{ background: courses.get(s.courseId)?.color }} aria-hidden="true" />
          ))}
        </button>
      ) : null}
    </div>
  )
}

const LINE = 'flex w-full min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-left text-[11.5px] leading-tight'

function TaskLine({ task, time, course, handlers }: { task: Task; time: string | null; course: Course | undefined; handlers: ViewHandlers }) {
  return (
    <DraggableTask
      task={task}
      course={course}
      label={taskLabel(task, time ? ` at ${time}` : '')}
      onOpen={(el) => handlers.onTask(task.id, el)}
      className={cn(LINE, 'hover:bg-fill', task.done && 'text-muted', task.category === 'exam' && !task.done && 'font-semibold')}
    >
      <TaskMarker task={task} color={course?.color} />
      <span className={cn('min-w-0 flex-1 truncate', task.done && 'line-through')}>{task.title}</span>
      {time ? <span className="shrink-0 text-[10.5px] font-normal text-muted tabular-nums">{time}</span> : null}
    </DraggableTask>
  )
}

function ClassLine({ session, course, day, handlers }: { session: ClassSession; course: Course | undefined; day: Date; handlers: ViewHandlers }) {
  const at = formatClock(toMinutes(session.start))
  const hover = useHoverDetails(() => <ClassInfo session={session} course={course} />)
  return (
    <button type="button" {...hover} className={cn(LINE, 'cursor-pointer text-muted hover:bg-fill')} onClick={(e) => handlers.onClass(session.id, day, e.currentTarget)} aria-label={`${course?.code ?? 'Class'} at ${at}`}>
      <i className="h-3 w-[2.5px] shrink-0 rounded-full" style={{ background: course?.color }} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{course?.code ?? 'Class'}</span>
      <span className="shrink-0 text-[10.5px] tabular-nums">{at}</span>
    </button>
  )
}
