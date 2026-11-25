import type { ClassSession, Task } from '@/types'
import { addDays, dateKey, startOfWeek, toMinutes } from '@/lib/time'
import { meetsOn } from '@/features/schedule/scheduleUtils'

/**
 * The calendar's view of existing records: classes from the schedule and tasks from the
 * To-Do List. Nothing here is stored. Every item on the calendar is one of those records,
 * so a change anywhere shows everywhere.
 */

export type CalendarView = 'week' | 'month'

/**
 * A task's due date, and its time if it has one. A bare date, or 23:59, means "by the end
 * of the day" (how the task form saves a date without a time), so it has no time.
 */
export function dueParts(task: Pick<Task, 'due'>): { date: string; time: string | null } | null {
  if (!task.due) return null
  const [date = '', rest] = task.due.split('T')
  const time = rest ? rest.slice(0, 5) : null
  return { date, time: time && time !== '23:59' ? time : null }
}

/** The days of the week containing `anchor`, Monday first, with or without the weekend. */
export function weekDays(anchor: Date, weekends: boolean): Date[] {
  const monday = startOfWeek(anchor)
  return Array.from({ length: weekends ? 7 : 5 }, (_, i) => addDays(monday, i))
}

/** The weeks that show the month containing `anchor`, each Monday first. */
export function monthWeeks(anchor: Date, weekends: boolean): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)
  const weeks: Date[][] = []
  for (let monday = startOfWeek(first); monday <= last; monday = addDays(monday, 7)) weeks.push(weekDays(monday, weekends))
  return weeks
}

/** One step back or forward: a week, or a month. */
export function shift(view: CalendarView, anchor: Date, step: -1 | 1): Date {
  return view === 'week' ? addDays(startOfWeek(anchor), 7 * step) : new Date(anchor.getFullYear(), anchor.getMonth() + step, 1)
}

const MONTH = (d: Date, year = false) => d.toLocaleDateString('en-US', year ? { month: 'long', year: 'numeric' } : { month: 'short' })

/** "November 2026", or "Nov 23 – 29, 2026", "Nov 30 – Dec 6, 2026", "Dec 28, 2026 – Jan 3, 2027". */
export function rangeTitle(view: CalendarView, anchor: Date): string {
  if (view === 'month') return MONTH(anchor, true)
  const a = startOfWeek(anchor)
  const b = addDays(a, 6)
  if (a.getFullYear() !== b.getFullYear()) return `${MONTH(a)} ${a.getDate()}, ${a.getFullYear()} – ${MONTH(b)} ${b.getDate()}, ${b.getFullYear()}`
  if (a.getMonth() !== b.getMonth()) return `${MONTH(a)} ${a.getDate()} – ${MONTH(b)} ${b.getDate()}, ${b.getFullYear()}`
  return `${MONTH(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
}

/** Tasks by due date, "YYYY-MM-DD". Tasks without a date are not on the calendar. */
export function tasksByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const task of tasks) {
    const due = dueParts(task)
    if (!due) continue
    const list = map.get(due.date)
    if (list) list.push(task)
    else map.set(due.date, [task])
  }
  return map
}

export interface DayItems {
  /** Due that day, with no particular time. Open ones first. */
  deadlines: Task[]
  /** Due at a time that day, earliest first. */
  timed: { task: Task; minutes: number }[]
  /** Classes meeting that day, within their term, earliest first. */
  classes: ClassSession[]
}

// "Item 3" before "Item 28".
const byOpenThenTitle = (a: Task, b: Task) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' })

/** Everything on one day. */
export function dayItems(day: Date, sessions: ClassSession[], byDate: Map<string, Task[]>): DayItems {
  const tasks = byDate.get(dateKey(day)) ?? []
  const deadlines: Task[] = []
  const timed: DayItems['timed'] = []
  for (const task of tasks) {
    const time = dueParts(task)?.time
    if (time) timed.push({ task, minutes: toMinutes(time) })
    else deadlines.push(task)
  }
  return {
    deadlines: deadlines.sort(byOpenThenTitle),
    timed: timed.sort((a, b) => a.minutes - b.minutes || byOpenThenTitle(a.task, b.task)),
    classes: sessions.filter((s) => meetsOn(s, day)).sort((a, b) => toMinutes(a.start) - toMinutes(b.start)),
  }
}

/** How many items a day has, for overflow counts and labels. */
export const itemCount = (d: DayItems) => d.deadlines.length + d.timed.length + d.classes.length

/** Whether any class still running meets on a Saturday or Sunday. */
export const meetsOnWeekends = (sessions: ClassSession[]) => sessions.some((s) => s.days.includes(0) || s.days.includes(6))

export interface Placed<T> {
  item: T
  start: number
  end: number
  /** Which side-by-side lane, from 0, and how many lanes its overlapping group needs. */
  lane: number
  lanes: number
}

/** Lays out timed blocks so overlapping ones sit side by side (as the schedule always has). */
export function layoutLanes<T>(blocks: { item: T; start: number; end: number }[]): Placed<T>[] {
  const items = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Placed<T>[] = []
  let group: Placed<T>[] = []
  let groupEnd = -1
  const flush = () => {
    const lanes = group.reduce((m, b) => Math.max(m, b.lane + 1), 1)
    for (const b of group) b.lanes = lanes
    out.push(...group)
    group = []
  }
  for (const it of items) {
    if (group.length > 0 && it.start >= groupEnd) flush()
    const used = new Set(group.filter((b) => b.end > it.start).map((b) => b.lane))
    let lane = 0
    while (used.has(lane)) lane++
    group.push({ ...it, lane, lanes: 1 })
    groupEnd = Math.max(groupEnd, it.end)
  }
  if (group.length > 0) flush()
  return out
}

/** "Mon, Nov 23". */
export const shortDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
/** "Monday, November 23". */
export const longDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

/** What the Display menu can show or hide. */
export type CalendarFilter = 'classes' | 'assignments' | 'exams' | 'todos'

export const filterOf = (t: Pick<Task, 'kind' | 'category'>): CalendarFilter =>
  t.kind === 'todo' ? 'todos' : t.category === 'exam' ? 'exams' : 'assignments'

/**
 * The hours a week grid shows: from half an hour before the earliest class or timed task to
 * half an hour after the latest, across the whole term, so the grid stays put from week to week.
 */
export function visibleHours(sessions: ClassSession[], timed: number[]): { start: number; end: number } {
  // A task due in the first half hour of the day is drawn after its time, not before.
  const times = [...sessions.flatMap((s) => [toMinutes(s.start), toMinutes(s.end)]), ...timed.flatMap((m) => (m < 30 ? [m, m + 30] : [m - 30, m]))]
  if (times.length === 0) return { start: 8, end: 18 }
  let start = Math.max(0, Math.floor((Math.min(...times) - 30) / 60))
  let end = Math.min(24, Math.ceil((Math.max(...times) + 30) / 60))
  // At least six hours, so there is room to add something around a short day: later first, then earlier.
  while (end - start < 6 && end < 24) end++
  while (end - start < 6 && start > 0) start--
  return { start, end }
}

export interface Span {
  start: number
  end: number
}

/** Classes that overlap each other, and exams at a time during a class, as named pairs. */
export function conflictsOn(items: DayItems): { a: string; b: string; span: Span }[] {
  const blocks = [
    ...items.classes.map((s) => ({ id: s.id, start: toMinutes(s.start), end: toMinutes(s.end), cls: true })),
    ...items.timed.filter(({ task }) => task.category === 'exam' && !task.done).map(({ task, minutes }) => ({ id: task.id, start: minutes, end: minutes + 1, cls: false })),
  ].sort((x, y) => x.start - y.start)
  const out: { a: string; b: string; span: Span }[] = []
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const x = blocks[i]!
      const y = blocks[j]!
      if (y.start >= x.end) break
      if (!x.cls && !y.cls) continue
      out.push({ a: x.id, b: y.id, span: { start: y.start, end: Math.min(x.end, y.end) } })
    }
  }
  return out
}

/** Gaps of at least half an hour between the first class of the day and the last. */
export function freePeriods(items: DayItems, minimum = 30): Span[] {
  const spans = items.classes.map((s) => ({ start: toMinutes(s.start), end: toMinutes(s.end) })).sort((a, b) => a.start - b.start)
  const out: Span[] = []
  let end = spans[0]?.end ?? 0
  for (const s of spans.slice(1)) {
    if (s.start - end >= minimum) out.push({ start: end, end: s.start })
    end = Math.max(end, s.end)
  }
  return out
}

/**
 * A task's new due value after it is dropped: on a day's deadline row (no time), on a month
 * day (same time, new date), or on the hours of a day, where `offset` is how far below the top
 * of the hours its top landed, in minutes. Timed tasks are drawn as the half hour before they
 * are due, so the due time is half an hour after where the top lands, to the quarter hour.
 * Null when nothing would change.
 */
export function dueAfterDrop(task: Pick<Task, 'due'>, target: { date: string; kind: 'due' | 'grid' | 'month' }, offset = 0, startHour = 0): string | null {
  const time = dueParts(task)?.time
  let due: string
  if (target.kind === 'due') due = `${target.date}T23:59`
  else if (target.kind === 'month') due = `${target.date}T${time ?? '23:59'}`
  else {
    const top = Math.round((startHour * 60 + offset) / 15) * 15
    const minutes = Math.max(15, Math.min(top + 30, 23 * 60 + 45))
    due = `${target.date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
  }
  // Same day and time, even if saved as a bare date: no change.
  const was = dueParts(task)
  const now = dueParts({ due })!
  return was && was.date === now.date && was.time === now.time ? null : due
}

/**
 * Where a task due at `minutes` is drawn: the half hour before it is due. A task due right at
 * the start of the hours shown (midnight, say) has no half hour before it, so it is drawn as
 * the half hour after, a readable block at the top of the day.
 */
export const timedSpan = (minutes: number, startHour: number) =>
  minutes - 30 >= startHour * 60 ? { start: minutes - 30, end: minutes } : { start: minutes, end: minutes + 30 }
