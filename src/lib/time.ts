import type { Weekday } from '@/types'

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** Monday-first display order. */
export const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

export const pad2 = (n: number): string => String(n).padStart(2, '0')

/** "09:15" to 555. */
export function toMinutes(hm: string): number {
  const [h = '0', m = '0'] = hm.split(':')
  return Number(h) * 60 + Number(m)
}

/** 555 to "09:15". Wraps at 24 hours. */
export function fromMinutes(total: number): string {
  const t = ((Math.round(total) % 1440) + 1440) % 1440
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds())
}

/** The moment `minutes` after midnight on the given calendar day. */
export function atMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes)
}

/** Local "YYYY-MM-DD". */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function parseDateKey(s: string): Date {
  const [y = 0, m = 1, d = 1] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Local "YYYY-MM-DDTHH:mm". */
export function toLocalIso(d: Date): string {
  return `${dateKey(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Accepts "YYYY-MM-DD" (end of that day) or "YYYY-MM-DDTHH:mm". */
export function parseLocalIso(s: string): Date {
  const [datePart = '', timePart] = s.split('T')
  const day = parseDateKey(datePart)
  if (!timePart) return atMinutes(day, 23 * 60 + 59)
  const [h = '0', m = '0'] = timePart.split(':')
  return atMinutes(day, Number(h) * 60 + Number(m))
}

/** Whole calendar days from b to a. Positive when a is later. */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000)
}

/** Monday of the week containing d. */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d)
  return addDays(day, -((day.getDay() + 6) % 7))
}

/** 555 to "9:15 AM". */
export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = Math.round(minutes % 60)
  return `${h % 12 || 12}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`
}

/** "09:15", "10:45" to "9:15 to 10:45 AM". */
export function formatRange(start: string, end: string): string {
  const a = formatClock(toMinutes(start))
  const b = formatClock(toMinutes(end))
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} to ${b}` : `${a} to ${b}`
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Hours and minutes in words: 135 to "2 h 15 min". */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute')
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} min` : plural(h, 'hour')
}

/** "Today", "Tomorrow" or the weekday name, relative to `now`. */
export function describeDay(d: Date, now: Date): string {
  const diff = dayDiff(d, now)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return WEEKDAY_NAMES[d.getDay()] ?? ''
}
