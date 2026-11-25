import type { MouseEvent } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import type { ClassSession, Course, Task } from '@/types'
import type { PopoverAnchor } from '@/components/ui/Popover'
import { cn } from '@/lib/cn'
import { dateKey, formatClock, formatRange, fromMinutes, toMinutes } from '@/lib/time'
import { dayItems, layoutLanes, longDay, timedSpan, type DayItems } from './calendarModel'
import { ClassInfo, DraggableTask, TaskMarker } from './events'
import { taskLabel, taskLook, tint, useHoverDetails } from './eventStyle'

export const PX_PER_HOUR = 60
/** Deadlines shown in a day before "N more". */
const DEADLINES_SHOWN = 3
const TODAY_TINT = 'bg-accent-fill/[0.045]'

export interface ViewHandlers {
  onTask: (id: string, anchor: HTMLElement) => void
  onClass: (id: string, day: Date, anchor: HTMLElement) => void
  onNew: (date: string, time: string | null, anchor: PopoverAnchor) => void
  /** Opens the day panel. */
  onDay: (day: Date) => void
}

type Block = { kind: 'class'; session: ClassSession } | { kind: 'task'; task: Task; due: number }

const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`

/** A week: days across, a row for each day's deadlines, then classes and timed tasks by the hour. */
export function WeekView({
  days,
  now,
  sessions,
  byDate,
  courses,
  hours,
  selected,
  handlers,
}: {
  days: Date[]
  now: Date
  sessions: ClassSession[]
  byDate: Map<string, Task[]>
  courses: Map<string, Course>
  /** First and last hour shown, fitted to the schedule. */
  hours: { start: number; end: number }
  /** The day open in the side panel. */
  selected: string | null
  handlers: ViewHandlers
}) {
  const perDay = days.map((day) => ({ day, items: dayItems(day, sessions, byDate) }))
  const { start: startHour, end: endHour } = hours
  const height = (endHour - startHour) * PX_PER_HOUR
  const todayKey = dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols = { gridTemplateColumns: `3.5rem repeat(${days.length}, minmax(7.5rem, 1fr))` }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="max-h-[calc(100svh-13rem)] min-h-[28rem] overflow-auto overscroll-contain" data-calendar-scroll>
        <div style={{ minWidth: `calc(3.5rem + ${days.length} * 7.5rem)` }}>
          {/* Days and deadlines stay in view while the hours scroll. */}
          <div className="sticky top-0 z-[3] bg-surface">
            <div className="grid border-b border-line" style={cols}>
              <div />
              {perDay.map(({ day }) => {
                const key = dateKey(day)
                const today = key === todayKey
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handlers.onDay(day)}
                    aria-label={`${longDay(day)}, details`}
                    aria-current={today ? 'date' : undefined}
                    aria-pressed={selected === key}
                    className={cn(
                      'flex cursor-pointer flex-col items-start gap-0.5 border-l border-line px-3 pt-3 pb-2.5 text-left transition-colors hover:bg-fill/60',
                      today && TODAY_TINT,
                      selected === key && 'bg-fill',
                    )}
                  >
                    <span className={cn('text-[11px] font-medium tracking-[0.08em] uppercase', today ? 'text-accent' : 'text-faint')}>
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <span
                      className={cn(
                        'grid h-8 min-w-8 place-items-center rounded-full text-[20px] leading-none font-semibold tracking-[-0.02em] tabular-nums',
                        today ? 'bg-accent-fill px-1.5 text-on-accent' : key < todayKey ? 'text-muted' : 'text-ink',
                        !today && '-ml-0.5 justify-items-start',
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="grid border-b border-line" style={cols}>
              <div className="self-start pt-2 pr-2 text-right text-[10.5px] font-medium tracking-[0.06em] text-faint uppercase">Due</div>
              {perDay.map(({ day, items }) => (
                <DeadlineCell key={dateKey(day)} day={day} today={dateKey(day) === todayKey} items={items} courses={courses} handlers={handlers} />
              ))}
            </div>
          </div>

          <div className="relative grid" style={{ ...cols, height }}>
            <div className="relative">
              {Array.from({ length: endHour - startHour - 1 }, (_, i) => (
                <span key={i} className="absolute right-2 -translate-y-1/2 text-[10.5px] whitespace-nowrap text-faint tabular-nums" style={{ top: (i + 1) * PX_PER_HOUR }}>
                  {hourLabel(startHour + i + 1)}
                </span>
              ))}
            </div>
            {perDay.map(({ day, items }) => (
              <DayColumn key={dateKey(day)} day={day} items={items} courses={courses} startHour={startHour} today={dateKey(day) === todayKey} nowMin={nowMin} endHour={endHour} handlers={handlers} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  items,
  courses,
  startHour,
  endHour,
  today,
  nowMin,
  handlers,
}: {
  day: Date
  items: DayItems
  courses: Map<string, Course>
  startHour: number
  endHour: number
  today: boolean
  nowMin: number
  handlers: ViewHandlers
}) {
  const key = dateKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: `grid:${key}`, data: { date: key, kind: 'grid' } })
  const blocks = layoutLanes<Block>([
    ...items.classes.map((session) => ({ item: { kind: 'class' as const, session }, start: toMinutes(session.start), end: toMinutes(session.end) })),
    ...items.timed.map(({ task, minutes }) => ({ item: { kind: 'task' as const, task, due: minutes }, ...timedSpan(minutes, startHour) })),
  ])

  /** A press on an empty part of the day: something new at that time. */
  const addAt = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const minutes = Math.round((startHour * 60 + (y / PX_PER_HOUR) * 60) / 15) * 15
    const at = { top: e.clientY, bottom: e.clientY, left: e.clientX, right: e.clientX }
    handlers.onNew(key, fromMinutes(Math.max(0, Math.min(minutes, 23 * 60 + 45))), { getBoundingClientRect: () => at })
  }

  return (
    <div
      ref={setNodeRef}
      role="presentation"
      data-day={key}
      onClick={addAt}
      className={cn('relative cursor-cell border-l border-line transition-colors', today && TODAY_TINT, isOver && 'bg-accent-fill/[0.08]')}
      style={{
        backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX_PER_HOUR - 1}px, color-mix(in srgb, var(--color-line) 55%, transparent) ${PX_PER_HOUR - 1}px, color-mix(in srgb, var(--color-line) 55%, transparent) ${PX_PER_HOUR}px)`,
      }}
    >
      {blocks.map((b) => {
        // Always inside its own time slot, so back-to-back events never overlap: 1 px above, 2 px below.
        const top = ((b.start - startHour * 60) / 60) * PX_PER_HOUR + 1
        const h = Math.max(1, ((b.end - b.start) / 60) * PX_PER_HOUR - 3)
        /** Too short for stacked lines: one line, tighter padding. */
        const compact = h < 46
        const box = { top, height: h, left: `calc(${(b.lane / b.lanes) * 100}% + 3px)`, width: `calc(${100 / b.lanes}% - 6px)` }
        if (b.item.kind === 'class') return <ClassBlock key={b.item.session.id} session={b.item.session} course={courses.get(b.item.session.courseId)} day={day} box={box} h={h} compact={compact} handlers={handlers} />
        const t = b.item.task
        const course = t.courseId ? courses.get(t.courseId) : undefined
        const at = formatClock(b.item.due)
        const look = taskLook(t, course?.color)
        return (
          <DraggableTask
            key={t.id}
            task={t}
            course={course}
            label={taskLabel(t, ` ${longDay(day)} at ${at}`)}
            onOpen={(el) => handlers.onTask(t.id, el)}
            className={cn('absolute z-[2] flex items-center gap-1.5 overflow-hidden rounded-[6px] px-2 text-left text-[12px] leading-none', look.className, t.done && 'opacity-70')}
            style={{ ...box, ...look.style, ...(t.category === 'exam' || t.done ? {} : { boxShadow: 'inset 0 0 0 1px var(--color-line)' }) }}
          >
            <TaskMarker task={t} color={course?.color} />
            <span className={cn('min-w-0 flex-1 truncate', t.done && 'line-through')}>{t.title}</span>
            <span className="shrink-0 text-[11px] font-normal text-muted tabular-nums">{at}</span>
          </DraggableTask>
        )
      })}
      {today && nowMin >= startHour * 60 && nowMin <= endHour * 60 ? (
        <div
          data-testid="now-line"
          className="pointer-events-none absolute inset-x-0 z-[3] h-px bg-bad before:absolute before:-top-[3px] before:-left-[3px] before:size-[7px] before:rounded-full before:bg-bad before:content-['']"
          style={{ top: ((nowMin - startHour * 60) / 60) * PX_PER_HOUR }}
        />
      ) : null}
    </div>
  )
}

function ClassBlock({
  session: s,
  course,
  day,
  box,
  h,
  compact,
  handlers,
}: {
  session: ClassSession
  course: Course | undefined
  day: Date
  box: { top: number; height: number; left: string; width: string }
  h: number
  compact: boolean
  handlers: ViewHandlers
}) {
  const range = formatRange(s.start, s.end)
  const hover = useHoverDetails(() => <ClassInfo session={s} course={course} />)
  return (
    <button
      type="button"
      data-compact={compact || undefined}
      {...hover}
      onClick={(e) => handlers.onClass(s.id, day, e.currentTarget)}
      aria-label={`${course?.code ?? 'Class'}, ${longDay(day)}, ${range}${s.room ? `, ${s.room}` : ''}`}
      className={cn(
        'absolute z-[1] flex cursor-pointer overflow-hidden border text-left transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110',
        compact ? 'items-center gap-1.5 rounded-[6px] pr-2 pl-3 leading-none' : 'flex-col gap-0.5 rounded-[7px] py-1.5 pr-2 pl-3 leading-snug',
      )}
      style={{ ...box, background: tint(course?.color, 9), borderColor: tint(course?.color, 26) }}
    >
      {/* The course color, as a thin line rather than a fill. */}
      <i className="absolute top-[3px] bottom-[3px] left-[3px] w-[3px] rounded-full" style={{ background: course?.color }} aria-hidden="true" />
      <span className={cn('truncate font-semibold tracking-[-0.005em]', compact ? 'shrink-0 text-[11.5px]' : 'text-[12.5px]')}>{course?.code ?? 'Class'}</span>
      {compact ? (
        h >= 14 ? <span className="min-w-0 truncate text-[11px] text-muted tabular-nums">{formatClock(toMinutes(s.start))}</span> : null
      ) : (
        <>
          <span className="truncate text-[11.5px] text-muted tabular-nums">{range}</span>
          {h >= 64 && s.room ? <span className="truncate text-[11.5px] text-faint">{s.room}</span> : null}
        </>
      )}
    </button>
  )
}

/** Deadlines: tasks due that day with no particular time. A drop here makes a task due that day. */
function DeadlineCell({ day, today, items, courses, handlers }: { day: Date; today: boolean; items: DayItems; courses: Map<string, Course>; handlers: ViewHandlers }) {
  const key = dateKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: `due:${key}`, data: { date: key, kind: 'due' } })
  const all = items.deadlines
  const shown = all.length > DEADLINES_SHOWN ? all.slice(0, DEADLINES_SHOWN - 1) : all
  const hidden = all.length - shown.length
  const addHere = (e: MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) handlers.onNew(key, null, e.currentTarget)
  }
  return (
    // Deadlines on the left, + in a column of its own: the two never share a spot.
    // On touch screens there is no +; a tap on the empty part of the day does the same.
    <div
      ref={setNodeRef}
      role="presentation"
      onClick={addHere}
      className={cn(
        'group grid min-h-10 cursor-cell grid-cols-[minmax(0,1fr)_1.5rem] items-start gap-1 border-l border-line py-1.5 pr-1 pl-1.5 transition-colors pointer-coarse:grid-cols-[minmax(0,1fr)] pointer-coarse:pr-1.5',
        today && TODAY_TINT,
        isOver && 'bg-accent-fill/[0.08]',
      )}
    >
      <div role="presentation" onClick={addHere} className="flex min-h-7 min-w-0 flex-col gap-1 self-stretch">
        {shown.map((task) => {
          const course = task.courseId ? courses.get(task.courseId) : undefined
          const look = taskLook(task, course?.color)
          return (
            <DraggableTask
              key={task.id}
              task={task}
              course={course}
              label={taskLabel(task, ` ${longDay(day)}`)}
              onOpen={(el) => handlers.onTask(task.id, el)}
              className={cn('flex w-full min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 py-[3px] text-left text-[12px] leading-tight', look.className)}
              style={look.style}
            >
              <TaskMarker task={task} color={course?.color} />
              <span className={cn('min-w-0 flex-1 truncate', task.done && 'line-through')}>{task.title}</span>
            </DraggableTask>
          )
        })}
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => handlers.onDay(day)}
            aria-label={`${hidden} more due ${longDay(day)}`}
            className="cursor-pointer self-start rounded-[6px] px-1.5 py-0.5 text-[11.5px] font-medium text-muted hover:bg-fill hover:text-ink"
          >
            {hidden} more
          </button>
        ) : null}
      </div>
      <button
        type="button"
        aria-label={`Add a task due ${longDay(day)}`}
        onClick={(e) => handlers.onNew(key, null, e.currentTarget)}
        className="grid size-6 cursor-pointer place-items-center rounded-full text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-fill hover:text-ink focus-visible:opacity-100 pointer-coarse:hidden"
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
