import type { Task, Urgency } from '@/types'
import { dayDiff, formatClock, parseLocalIso, plural } from '@/lib/time'

/** Display order for urgency groups. */
export const URGENCY_ORDER: Urgency[] = ['overdue', 'today', 'this-week', 'later', 'no-date', 'done']

export const URGENCY_LABEL: Record<Urgency, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  'this-week': 'This week',
  later: 'Later',
  'no-date': 'No due date',
  done: 'Done',
}

/** Pure: takes the clock as an argument so tests can pin it. */
export function getUrgency(task: Task, now: Date): Urgency {
  if (task.done) return 'done'
  if (!task.due) return 'no-date'
  const due = parseLocalIso(task.due)
  if (due.getTime() < now.getTime()) return 'overdue'
  const days = dayDiff(due, now)
  if (days === 0) return 'today'
  if (days <= 6) return 'this-week'
  return 'later'
}

/** Earliest due first. Undated tasks go last. Done tasks go after open ones. */
export function compareTasks(a: Task, b: Task): number {
  if (a.done !== b.done) return a.done ? 1 : -1
  const da = a.due ? parseLocalIso(a.due).getTime() : Number.POSITIVE_INFINITY
  const db = b.due ? parseLocalIso(b.due).getTime() : Number.POSITIVE_INFINITY
  if (da !== db) return da < db ? -1 : 1
  return a.title.localeCompare(b.title)
}

export function groupByUrgency(tasks: Task[], now: Date): Record<Urgency, Task[]> {
  const groups: Record<Urgency, Task[]> = {
    overdue: [],
    today: [],
    'this-week': [],
    later: [],
    'no-date': [],
    done: [],
  }
  for (const task of [...tasks].sort(compareTasks)) groups[getUrgency(task, now)].push(task)
  return groups
}

/** Open tasks that need attention in the next 7 days, plus anything overdue. */
export function urgentTasks(tasks: Task[], now: Date, limit = 4): Task[] {
  return [...tasks]
    .filter((t) => {
      const u = getUrgency(t, now)
      return u === 'overdue' || u === 'today' || u === 'this-week'
    })
    .sort(compareTasks)
    .slice(0, limit)
}

export type DueTone = 'bad' | 'warn' | 'normal' | 'faint'

/** Short text for the due column, like "Due tomorrow" or "Overdue 2 days". */
export function dueLabel(task: Task, now: Date): { text: string; tone: DueTone } {
  const urgency = getUrgency(task, now)
  if (urgency === 'done') return { text: 'Done', tone: 'faint' }
  if (!task.due) return { text: 'No date', tone: 'faint' }
  const due = parseLocalIso(task.due)
  const days = dayDiff(due, now)
  const hasTime = task.due.includes('T') && !task.due.endsWith('T23:59')
  const time = hasTime ? ` at ${formatClock(due.getHours() * 60 + due.getMinutes())}` : ''
  if (urgency === 'overdue') {
    return days === 0
      ? { text: 'Overdue today', tone: 'bad' }
      : { text: `Overdue ${plural(-days, 'day')}`, tone: 'bad' }
  }
  if (days === 0) return { text: `Due today${time}`, tone: 'warn' }
  if (days === 1) return { text: `Due tomorrow${time}`, tone: 'normal' }
  if (days <= 6) {
    const dow = due.toLocaleDateString('en-US', { weekday: 'short' })
    return { text: `Due ${dow}${time}`, tone: 'normal' }
  }
  return {
    text: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tone: 'normal',
  }
}
