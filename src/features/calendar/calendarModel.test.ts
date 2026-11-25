import { describe, expect, it } from 'vitest'
import type { ClassSession, Task } from '@/types'
import { dateKey } from '@/lib/time'
import { conflictsOn, dayItems, dueAfterDrop, timedSpan, dueParts, filterOf, freePeriods, itemCount, layoutLanes, monthWeeks, rangeTitle, shift, tasksByDate, visibleHours, weekDays } from './calendarModel'
import { fieldsOf, typeLabel, typeOf } from '@/features/assignments/taskType'
import { CALENDAR_KEY, readPrefs } from './useCalendarPrefs'

const task = (id: string, due?: string, extra: Partial<Task> = {}): Task => ({ id, kind: 'todo', title: id, due, done: false, source: 'manual', ...extra })
const session = (id: string, extra: Partial<ClassSession> = {}): ClassSession => ({ id, courseId: 'c', days: [1, 4], start: '09:15', end: '10:45', ...extra })
const keys = (days: Date[]) => days.map(dateKey)

describe('due dates', () => {
  it('treats a bare date and 23:59 as "by the end of the day", and keeps real times', () => {
    expect(dueParts(task('a', '2026-11-24'))).toEqual({ date: '2026-11-24', time: null })
    expect(dueParts(task('b', '2026-11-24T23:59'))).toEqual({ date: '2026-11-24', time: null })
    expect(dueParts(task('c', '2026-11-24T17:00'))).toEqual({ date: '2026-11-24', time: '17:00' })
    expect(dueParts(task('d'))).toBeNull()
  })
})

describe('weeks and months', () => {
  it('starts weeks on Monday, with or without the weekend', () => {
    const wed = new Date(2026, 10, 25)
    expect(keys(weekDays(wed, false))).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'])
    expect(keys(weekDays(wed, true)).at(-1)).toBe('2026-11-29')
  })

  it('covers a whole month in Monday-first weeks', () => {
    const weeks = monthWeeks(new Date(2026, 10, 15), true)
    expect(weeks).toHaveLength(6)
    expect(dateKey(weeks[0]![0]!)).toBe('2026-10-26')
    expect(dateKey(weeks.at(-1)!.at(-1)!)).toBe('2026-12-06')
  })

  it('steps by a week or a month, past and future', () => {
    const d = new Date(2026, 10, 25)
    expect(dateKey(shift('week', d, -1))).toBe('2026-11-16')
    expect(dateKey(shift('week', d, 1))).toBe('2026-11-30')
    expect(dateKey(shift('month', d, -1))).toBe('2026-10-01')
    expect(dateKey(shift('month', new Date(2026, 11, 31), 1))).toBe('2027-01-01')
  })

  it('names the range briefly', () => {
    expect(rangeTitle('month', new Date(2026, 10, 3))).toBe('November 2026')
    expect(rangeTitle('week', new Date(2026, 10, 25))).toBe('Nov 23 – 29, 2026')
    expect(rangeTitle('week', new Date(2026, 11, 2))).toBe('Nov 30 – Dec 6, 2026')
    expect(rangeTitle('week', new Date(2026, 11, 30))).toBe('Dec 28, 2026 – Jan 3, 2027')
  })
})

describe('what is on a day', () => {
  const thursday = new Date(2026, 10, 26)
  const tasks = [
    task('Essay', '2026-11-26T23:59'),
    task('Done reading', '2026-11-26', { done: true }),
    task('Quiz', '2026-11-26T10:00'),
    task('Lab', '2026-11-26T08:00'),
    task('Other day', '2026-11-27T10:00'),
    task('No date'),
  ]

  it('puts untimed tasks with the deadlines, open first, and timed ones by time', () => {
    const items = dayItems(thursday, [], tasksByDate(tasks))
    expect(items.deadlines.map((t) => t.id)).toEqual(['Essay', 'Done reading'])
    expect(items.timed.map((t) => [t.task.id, t.minutes])).toEqual([
      ['Lab', 480],
      ['Quiz', 600],
    ])
    expect(itemCount(items)).toBe(4)
  })

  it('orders deadlines by number the way people read them', () => {
    const items = dayItems(thursday, [], tasksByDate(['Item 28', 'Item 3', 'item 10'].map((n) => task(n, '2026-11-26'))))
    expect(items.deadlines.map((t) => t.id)).toEqual(['Item 3', 'item 10', 'Item 28'])
  })

  it('shows a class only within its term', () => {
    const sessions = [session('always'), session('ended', { endsOn: '2026-11-25' }), session('later', { startsOn: '2026-12-01' }), session('this-term', { startsOn: '2026-11-01', endsOn: '2026-11-26' })]
    expect(dayItems(thursday, sessions, new Map()).classes.map((s) => s.id)).toEqual(['always', 'this-term'])
    // The week before, the ended class was still running.
    expect(dayItems(new Date(2026, 10, 19), sessions, new Map()).classes.map((s) => s.id)).toEqual(['always', 'ended', 'this-term'])
  })

  it('lays overlapping blocks side by side', () => {
    const placed = layoutLanes([
      { item: 'a', start: 540, end: 630 },
      { item: 'b', start: 600, end: 660 },
      { item: 'c', start: 700, end: 760 },
    ])
    expect(placed.map((p) => [p.item, p.lane, p.lanes])).toEqual([
      ['a', 0, 2],
      ['b', 1, 2],
      ['c', 0, 1],
    ])
  })
})

describe('the hours shown', () => {
  it('fits the term, with half an hour either side, and at least six hours', () => {
    expect(visibleHours([session('a', { start: '07:30', end: '09:00' }), session('b', { start: '13:00', end: '16:15' })], [])).toEqual({ start: 7, end: 17 })
    expect(visibleHours([session('a', { start: '09:00', end: '10:00' })], [])).toEqual({ start: 8, end: 14 })
    expect(visibleHours([], [])).toEqual({ start: 8, end: 18 })
    // A task due at midnight is drawn after it, so the hours start at midnight.
    expect(visibleHours([session('a', { start: '09:00', end: '15:00' })], [0]).start).toBe(0)
    expect(timedSpan(0, 0)).toEqual({ start: 0, end: 30 })
    expect(timedSpan(17 * 60, 8)).toEqual({ start: 16 * 60 + 30, end: 17 * 60 })
    // A task due late in the evening stretches the end.
    expect(visibleHours([session('a', { start: '09:00', end: '15:00' })], [23 * 60])).toEqual({ start: 8, end: 24 })
  })
})

describe('a day in detail', () => {
  const day = new Date(2026, 10, 26)
  const sessions = [session('fnd', { start: '09:15', end: '10:45' }), session('cs', { start: '10:00', end: '11:30' }), session('math', { start: '13:15', end: '14:45' })]

  it('finds classes that clash, and exams during a class', () => {
    const items = dayItems(day, sessions, tasksByDate([task('mid', '2026-11-26T14:00', { category: 'exam' }), task('hw', '2026-11-26T14:00')]))
    expect(conflictsOn(items)).toEqual([
      { a: 'fnd', b: 'cs', span: { start: 600, end: 645 } },
      { a: 'math', b: 'mid', span: { start: 840, end: 841 } },
    ])
  })

  it('finds free time of half an hour or more between classes', () => {
    expect(freePeriods(dayItems(day, sessions, new Map()))).toEqual([{ start: 690, end: 795 }])
    expect(freePeriods(dayItems(day, [session('a', { start: '09:00', end: '10:00' }), session('b', { start: '10:20', end: '11:00' })], new Map()))).toEqual([])
  })
})

describe('rescheduling by drag and drop', () => {
  const t = (due: string) => ({ due })
  it('drops on a deadline row as due that day, without a time', () => {
    expect(dueAfterDrop(t('2026-11-24T15:00'), { date: '2026-11-26', kind: 'due' })).toBe('2026-11-26T23:59')
  })
  it('drops on a month day keeping the time', () => {
    expect(dueAfterDrop(t('2026-11-24T15:00'), { date: '2026-11-30', kind: 'month' })).toBe('2026-11-30T15:00')
    expect(dueAfterDrop(t('2026-11-24'), { date: '2026-11-30', kind: 'month' })).toBe('2026-11-30T23:59')
  })
  it('drops on the hours at the quarter hour, due half an hour after where it lands', () => {
    // Top lands 122 minutes below an 8 AM start: 10:00, so due at 10:30.
    expect(dueAfterDrop(t('2026-11-24'), { date: '2026-11-25', kind: 'grid' }, 122, 8)).toBe('2026-11-25T10:30')
    // Never past the end of the day.
    expect(dueAfterDrop(t('2026-11-24'), { date: '2026-11-25', kind: 'grid' }, 2000, 8)).toBe('2026-11-25T23:45')
  })
  it('reports no change when it lands where it was', () => {
    expect(dueAfterDrop(t('2026-11-26T23:59'), { date: '2026-11-26', kind: 'due' })).toBeNull()
    // Saved as a bare date by an older version: still the same day, no time.
    expect(dueAfterDrop(t('2026-11-26'), { date: '2026-11-26', kind: 'due' })).toBeNull()
    expect(dueAfterDrop(t('2026-11-26'), { date: '2026-11-26', kind: 'month' })).toBeNull()
  })
})

describe('task types', () => {
  it('maps what the student picks to what is stored, and back', () => {
    expect(fieldsOf('exam')).toEqual({ kind: 'assignment', category: 'exam' })
    expect(fieldsOf('todo')).toEqual({ kind: 'todo', category: null })
    expect(typeOf({ kind: 'assignment', category: 'exam' })).toBe('exam')
    // A to-do is never an exam, whatever an odd record says.
    expect(typeOf({ kind: 'todo', category: 'exam' })).toBe('todo')
    expect(typeLabel({ kind: 'assignment' })).toBe('Assignment')
    expect(filterOf({ kind: 'assignment', category: 'exam' })).toBe('exams')
  })
})

describe('display preferences', () => {
  it('reads saved preferences, and ignores anything odd', () => {
    localStorage.setItem(CALENDAR_KEY, JSON.stringify({ v: 1, view: 'month', weekends: true, hidden: ['exams', 'parties'], completed: false }))
    expect(readPrefs()).toEqual({ view: 'month', weekends: true, hidden: ['exams'], completed: false })
    localStorage.setItem(CALENDAR_KEY, JSON.stringify({ v: 1, view: 'week' }))
    expect(readPrefs()).toEqual({ view: 'week', weekends: null, hidden: [], completed: true })
    localStorage.removeItem(CALENDAR_KEY)
  })
})
