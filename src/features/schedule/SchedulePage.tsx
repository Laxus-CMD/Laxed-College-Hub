import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type Over } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Popover, type PopoverAnchor } from '@/components/ui/Popover'
import { cn } from '@/lib/cn'
import { dateKey, formatClock, fromMinutes, parseDateKey, plural, startOfWeek, toMinutes } from '@/lib/time'
import { useNow } from '@/lib/useNow'
import { currentSessions, weeklyMinutes } from '@/features/schedule/scheduleUtils'
import {
  dayItems,
  dueAfterDrop,
  dueParts,
  filterOf,
  itemCount,
  meetsOnWeekends,
  monthWeeks,
  rangeTitle,
  shift,
  shortDay,
  tasksByDate,
  visibleHours,
  weekDays,
  type CalendarView,
} from '@/features/calendar/calendarModel'
import { ClassDetails, EndTerm, NewTask, TaskDetails } from '@/features/calendar/CalendarPopovers'
import { DayPanel } from '@/features/calendar/DayPanel'
import { DisplayMenu } from '@/features/calendar/DisplayMenu'
import { HoverCard, TaskMarker } from '@/features/calendar/events'
import { HoverContext } from '@/features/calendar/eventStyle'
import { MonthView } from '@/features/calendar/MonthView'
import { useCalendarPrefs } from '@/features/calendar/useCalendarPrefs'
import { PX_PER_HOUR, WeekView, type ViewHandlers } from '@/features/calendar/WeekView'
import { rescheduleTask } from '@/store/actions'
import { useCourseMap } from '@/store/selectors'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

type Pop =
  | { kind: 'task'; id: string; anchor: PopoverAnchor }
  | { kind: 'new'; date: string; time: string | null; anchor: PopoverAnchor }
  | { kind: 'class'; id: string; date: string; anchor: PopoverAnchor }
  | { kind: 'term'; anchor: PopoverAnchor }
  | { kind: 'display'; anchor: PopoverAnchor }

const VIEWS: { id: CalendarView; label: string }[] = [
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
]

const POP_LABEL: Record<Pop['kind'], string> = { task: 'Task', new: 'New task', class: 'Class', term: 'Term', display: 'Display' }

/**
 * The Schedule: classes and tasks on one calendar, by week or by month, past and future.
 * Everything on it is an existing class or task, so changes here are changes there.
 */
export default function SchedulePage() {
  const now = useNow()
  const sessions = useScheduleStore((s) => s.sessions)
  const tasks = useTaskStore((s) => s.tasks)
  const courses = useCourseMap()
  const openDialog = useUiStore((s) => s.openDialog)
  const [prefs, setPrefs] = useCalendarPrefs()
  const [anchor, setAnchor] = useState(() => new Date())
  const [pop, setPop] = useState<Pop | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hover, setHover] = useState<{ anchor: HTMLElement; content: ReactNode } | null>(null)
  const hoverTimer = useRef<number | undefined>(undefined)
  /** A drop ends with a click on whatever is under the pointer; that click is not a request. */
  const justDropped = useRef(false)

  const view = prefs.view
  const running = currentSessions(sessions, now)
  const weekends = prefs.weekends ?? meetsOnWeekends(running)
  const shownSessions = prefs.hidden.includes('classes') ? [] : sessions
  const shownTasks = tasks.filter((t) => !prefs.hidden.includes(filterOf(t)) && (prefs.completed || !t.done))
  const byDate = tasksByDate(shownTasks)
  const days = weekDays(anchor, weekends)
  const hours = visibleHours(
    sessions,
    days.flatMap((d) => dayItems(d, [], byDate).timed.map((t) => t.minutes)),
  )
  const weeklyHours = Math.round((weeklyMinutes(running) / 60) * 10) / 10
  const showingToday = view === 'week' ? dateKey(startOfWeek(anchor)) === dateKey(startOfWeek(now)) : anchor.getFullYear() === now.getFullYear() && anchor.getMonth() === now.getMonth()
  const unit = view === 'week' ? 'week' : 'month'
  // Hidden weekends must not hide deadlines: say how many items they hold.
  const onWeekends = weekends
    ? 0
    : (view === 'week' ? weekDays(anchor, true) : monthWeeks(anchor, true).flat())
        .filter((d) => (d.getDay() === 0 || d.getDay() === 6) && (view === 'week' || d.getMonth() === anchor.getMonth()))
        .reduce((n, d) => n + itemCount(dayItems(d, shownSessions, byDate)), 0)

  const hoverApi = useMemo(
    () => ({
      show: (el: HTMLElement, content: ReactNode) => {
        window.clearTimeout(hoverTimer.current)
        hoverTimer.current = window.setTimeout(() => setHover(el.isConnected ? { anchor: el, content } : null), 450)
      },
      hide: () => {
        window.clearTimeout(hoverTimer.current)
        setHover(null)
      },
    }),
    [],
  )
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  // A new week or month replaces every item: whatever was hovered is gone.
  useEffect(() => hoverApi.hide(), [hoverApi, view, anchor])

  const handlers: ViewHandlers = {
    onTask: (id, el) => setPop({ kind: 'task', id, anchor: el }),
    onClass: (id, day, el) => setPop({ kind: 'class', id, date: dateKey(day), anchor: el }),
    onNew: (date, time, at) => {
      if (!justDropped.current) setPop({ kind: 'new', date, time, anchor: at })
    },
    onDay: (day) => setSelected((s) => (s === dateKey(day) ? null : dateKey(day))),
  }
  const close = () => setPop(null)

  // ── Rescheduling by drag and drop ────────────────────────────────────────
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }))
  const taskOf = (id: unknown) => tasks.find((t) => `task:${t.id}` === id)
  const placeOf = (over: Over | null) => {
    const d = over?.data.current as { date: string; kind: string } | undefined
    if (!d) return 'nowhere'
    return `${d.kind === 'grid' ? 'the hours of ' : ''}${shortDay(parseDateKey(d.date))}`
  }
  /** The new due value for a drop, or null when it would not change. */
  const dropDue = (e: DragEndEvent): string | null => {
    const task = taskOf(e.active.id)
    const target = e.over?.data.current as { date: string; kind: 'due' | 'grid' | 'month' } | undefined
    if (!task || !target || !e.over) return null
    // How far below the top of the hours the task's top landed, in minutes.
    const top = e.active.rect.current.translated?.top ?? e.over.rect.top
    return dueAfterDrop(task, target, ((top - e.over.rect.top) / PX_PER_HOUR) * 60, hours.start)
  }
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null)
    justDropped.current = true
    window.setTimeout(() => (justDropped.current = false), 0)
    const task = taskOf(e.active.id)
    const due = dropDue(e)
    if (!task || !due) return
    const parts = dueParts({ due })!
    rescheduleTask(task.id, due, `Moved to ${shortDay(parseDateKey(parts.date))}${parts.time ? ` at ${formatClock(toMinutes(parts.time))}` : ''}.`)
  }
  const draggedTask = dragging ? tasks.find((t) => t.id === dragging) : undefined

  const selectedDay = selected ? parseDateKey(selected) : null

  return (
    <HoverContext value={hoverApi}>
      <PageHeader
        title="Schedule"
        subtitle={running.length ? `${plural(running.length, 'class', 'classes')} this term, ${weeklyHours} ${weeklyHours === 1 ? 'hour' : 'hours'} a week` : 'No classes this term yet'}
        actions={
          <>
            <Button variant="subtle" onClick={(e) => setPop({ kind: 'term', anchor: e.currentTarget })}>
              Term
            </Button>
            <Button variant="primary" onClick={() => openDialog({ type: 'session' })}>
              <Plus className="size-4" aria-hidden="true" />
              Add class
            </Button>
          </>
        }
      />

      {/* One toolbar: where you are, and how you look at it. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2.5">
        <div className="flex items-center rounded-lg border border-line bg-surface p-0.5">
          <IconButton label={`Previous ${unit}`} className="size-7" onClick={() => setAnchor((a) => shift(view, a, -1))}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </IconButton>
          <button
            type="button"
            disabled={showingToday}
            onClick={() => setAnchor(new Date())}
            className="h-7 cursor-pointer rounded-[6px] px-2.5 text-[13px] font-medium text-ink transition-colors hover:bg-fill disabled:cursor-default disabled:text-faint disabled:hover:bg-transparent"
          >
            Today
          </button>
          <IconButton label={`Next ${unit}`} className="size-7" onClick={() => setAnchor((a) => shift(view, a, 1))}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
        <h2 aria-live="polite" className="min-w-0 text-[17px] font-semibold tracking-[-0.015em]">
          {rangeTitle(view, anchor)}
        </h2>
        <span className="flex-1" />
        {onWeekends > 0 ? (
          <button type="button" onClick={() => setPrefs({ weekends: true })} className="cursor-pointer rounded-full px-2.5 py-1 text-[12px] font-medium text-muted hover:bg-fill hover:text-ink">
            {onWeekends} on weekends
          </button>
        ) : null}
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">View</legend>
          <div className="relative grid grid-cols-2 rounded-lg bg-fill p-[3px]">
            <span
              aria-hidden="true"
              className="absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/2)] rounded-[6px] bg-thumb shadow-thumb transition-transform duration-300 ease-(--ease-apple) motion-reduce:transition-none"
              style={{ transform: `translateX(${view === 'month' ? 100 : 0}%)` }}
            />
            {VIEWS.map((v) => (
              <label key={v.id} className="relative">
                <input type="radio" name="calendar-view" value={v.id} checked={view === v.id} onChange={() => setPrefs({ view: v.id })} className="peer absolute inset-0 m-0 cursor-pointer opacity-0" />
                <span className="flex h-7 min-w-16 items-center justify-center rounded-[6px] px-3 text-[13px] font-medium text-muted transition-colors peer-checked:text-ink peer-hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent pointer-coarse:h-9">
                  {v.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button size="sm" variant="subtle" aria-haspopup="dialog" onClick={(e) => setPop({ kind: 'display', anchor: e.currentTarget })}>
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Display
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e) => {
          setDragging(taskOf(e.active.id)?.id ?? null)
          setPop(null)
          hoverApi.hide()
        }}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: 'To reschedule, drag the task to another day or time. You can also open it and change its date.' },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${taskOf(active.id)?.title ?? 'task'}.`,
            onDragOver: ({ active, over }) => `${taskOf(active.id)?.title ?? 'Task'} is over ${placeOf(over)}.`,
            onDragEnd: ({ active, over }) => (over ? `${taskOf(active.id)?.title ?? 'Task'} was moved to ${placeOf(over)}.` : `${taskOf(active.id)?.title ?? 'Task'} was not moved.`),
            onDragCancel: ({ active }) => `Moving ${taskOf(active.id)?.title ?? 'the task'} was cancelled.`,
          },
        }}
      >
        <div className={cn('grid items-start gap-5', selectedDay && 'xl:grid-cols-[minmax(0,1fr)_19rem]')}>
          <div key={view} className="min-w-0 motion-safe:animate-[fade-in_.2s_var(--ease-apple)]">
            {view === 'week' ? (
              <WeekView days={days} now={now} sessions={shownSessions} byDate={byDate} courses={courses} hours={hours} selected={selected} handlers={handlers} />
            ) : (
              <MonthView weeks={monthWeeks(anchor, weekends)} month={anchor.getMonth()} now={now} sessions={shownSessions} byDate={byDate} courses={courses} selected={selected} handlers={handlers} />
            )}
          </div>
          {selectedDay ? (
            <DayPanel
              day={selectedDay}
              now={now}
              items={dayItems(selectedDay, shownSessions, byDate)}
              courses={courses}
              onClose={() => setSelected(null)}
              onTask={(id, el) => setPop({ kind: 'task', id, anchor: el })}
              onClass={(id, el) => setPop({ kind: 'class', id, date: selected!, anchor: el })}
              onAdd={(el) => setPop({ kind: 'new', date: selected!, time: null, anchor: el })}
              onWeek={
                view === 'month'
                  ? () => {
                      setAnchor(selectedDay)
                      setPrefs({ view: 'week' })
                    }
                  : undefined
              }
            />
          ) : null}
        </div>
        <DragOverlay dropAnimation={null}>
          {draggedTask ? (
            <div className="flex max-w-56 items-center gap-1.5 rounded-[6px] border border-line bg-raised px-2 py-1 text-[12px] font-medium shadow-pop">
              <TaskMarker task={draggedTask} color={draggedTask.courseId ? courses.get(draggedTask.courseId)?.color : undefined} />
              <span className="truncate">{draggedTask.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {hover && !pop && !dragging ? <HoverCard anchor={hover.anchor}>{hover.content}</HoverCard> : null}

      {pop ? (
        <Popover key={pop.kind === 'task' || pop.kind === 'class' ? `${pop.kind}-${pop.id}` : pop.kind} anchor={pop.anchor} label={POP_LABEL[pop.kind]} onClose={close} className={cn(pop.kind === 'display' && 'w-[min(15rem,calc(100vw-1.5rem))] p-2')}>
          {pop.kind === 'task' ? <TaskDetails id={pop.id} onClose={close} /> : null}
          {pop.kind === 'class' ? <ClassDetails id={pop.id} date={pop.date} today={now} onClose={close} /> : null}
          {pop.kind === 'term' ? <EndTerm today={now} onClose={close} /> : null}
          {pop.kind === 'display' ? <DisplayMenu prefs={prefs} weekends={weekends} onChange={setPrefs} /> : null}
          {pop.kind === 'new' ? (
            <NewTask
              date={pop.date}
              time={pop.time}
              onClose={close}
              onAddClass={
                pop.time
                  ? () => {
                      const start = toMinutes(pop.time!)
                      close()
                      openDialog({
                        type: 'session',
                        preset: { days: [parseDateKey(pop.date).getDay() as 0], start: pop.time!, end: fromMinutes(Math.min(start + 90, 23 * 60 + 45)) },
                      })
                    }
                  : undefined
              }
            />
          ) : null}
        </Popover>
      ) : null}
    </HoverContext>
  )
}
