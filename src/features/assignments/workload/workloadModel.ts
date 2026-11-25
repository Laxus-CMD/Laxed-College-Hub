import type { Task } from '@/types'
import { addDays, dateKey, startOfDay } from '@/lib/time'
import { compareTasks, getUrgency } from '@/features/assignments/urgency'

/**
 * What the next days ask of a student, from their open tasks. Every number here is a count of
 * tasks or a sum of estimates the student gave; nothing is guessed. A task with no estimate
 * counts as a task and adds no time.
 */

export type Measure = 'tasks' | 'time'

export interface Load {
  tasks: number
  exams: number
  /** Sum of the estimates given. */
  minutes: number
  /** How many of the tasks have an estimate. */
  estimated: number
}

export interface CourseLoad extends Load {
  /** Null for tasks with no course. */
  courseId: string | null
}

export interface DayLoad extends Load {
  key: string
  date: Date
  /** Open tasks due that day, most pressing first. */
  items: Task[]
  /** The same day split by course, in the order of `courseOrder`. */
  byCourse: CourseLoad[]
}

export interface Workload extends Load {
  days: DayLoad[]
  /** Totals per course over the whole range, heaviest first. */
  courses: CourseLoad[]
  /** Open tasks already past due. Not in the days. */
  overdue: number
  /** Open tasks with no due date. Not in the days. */
  undated: number
}

const empty = (): Load => ({ tasks: 0, exams: 0, minutes: 0, estimated: 0 })

function add(load: Load, t: Task) {
  load.tasks++
  if (t.category === 'exam') load.exams++
  if (t.estimate) {
    load.minutes += t.estimate
    load.estimated++
  }
}

/**
 * Open work from today through `span` days, by day and by course. `courseOrder` fixes the order
 * of course segments, so a course keeps its place (and its color next to the same neighbors)
 * whatever the range.
 */
export function workload(tasks: Task[], now: Date, span: number, courseOrder: string[]): Workload {
  const today = startOfDay(now)
  const days: DayLoad[] = Array.from({ length: span }, (_, i) => {
    const date = addDays(today, i)
    return { key: dateKey(date), date, items: [], byCourse: [], ...empty() }
  })
  const index = new Map(days.map((d, i) => [d.key, i]))
  const total = empty()
  const perCourse = new Map<string | null, CourseLoad>()
  let overdue = 0
  let undated = 0

  for (const t of tasks) {
    if (t.done) continue
    if (!t.due) {
      undated++
      continue
    }
    if (getUrgency(t, now) === 'overdue') {
      overdue++
      continue
    }
    const i = index.get(t.due.slice(0, 10))
    if (i === undefined) continue
    days[i]!.items.push(t)
    add(days[i]!, t)
    add(total, t)
    const course = t.courseId ?? null
    if (!perCourse.has(course)) perCourse.set(course, { courseId: course, ...empty() })
    add(perCourse.get(course)!, t)
  }

  const rank = (id: string | null) => (id === null ? courseOrder.length : Math.max(0, courseOrder.indexOf(id)))
  for (const d of days) {
    d.items.sort(compareTasks)
    const split = new Map<string | null, CourseLoad>()
    for (const t of d.items) {
      const course = t.courseId ?? null
      if (!split.has(course)) split.set(course, { courseId: course, ...empty() })
      add(split.get(course)!, t)
    }
    d.byCourse = [...split.values()].sort((a, b) => rank(a.courseId) - rank(b.courseId))
  }

  const courses = [...perCourse.values()].sort((a, b) => b.tasks - a.tasks || b.minutes - a.minutes || rank(a.courseId) - rank(b.courseId))
  return { days, courses, overdue, undated, ...total }
}

/** The value a measure reads off a load. */
export const valueOf = (load: Load, measure: Measure) => (measure === 'time' ? load.minutes : load.tasks)

/**
 * The days that ask the most, heaviest first, at most `limit`. A ranking of what is there, not
 * a threshold: the student sees which days stand out and by how much.
 */
export function heaviestDays(days: DayLoad[], measure: Measure, limit = 3): DayLoad[] {
  return days
    .filter((d) => valueOf(d, measure) > 0)
    .sort((a, b) => valueOf(b, measure) - valueOf(a, measure) || b.exams - a.exams || a.key.localeCompare(b.key))
    .slice(0, limit)
}

