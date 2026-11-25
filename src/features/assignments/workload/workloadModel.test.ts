import { describe, expect, it } from 'vitest'
import type { Task } from '@/types'
import { heaviestDays, workload } from './workloadModel'

// Tuesday, November 24 2026, 9:00.
const NOW = new Date(2026, 10, 24, 9, 0)
const task = (id: string, due: string | undefined, extra: Partial<Task> = {}): Task => ({ id, kind: 'assignment', title: id, due, done: false, source: 'manual', ...extra })

describe('workload', () => {
  const tasks = [
    task('a', '2026-11-24T23:59', { courseId: 'c2', estimate: 60 }),
    task('b', '2026-11-24', { courseId: 'c1' }),
    task('c', '2026-11-26T10:00', { courseId: 'c1', category: 'exam', estimate: 120 }),
    task('d', '2026-11-26', { courseId: 'c1', done: true, estimate: 300 }),
    task('late', '2026-11-20'),
    task('someday', undefined),
    task('far', '2026-12-30'),
  ]
  const w = workload(tasks, NOW, 7, ['c1', 'c2'])

  it('counts open tasks per day, from today, and leaves finished work out', () => {
    expect(w.days).toHaveLength(7)
    expect(w.days[0]).toMatchObject({ key: '2026-11-24', tasks: 2, minutes: 60, estimated: 1 })
    expect(w.days[2]).toMatchObject({ key: '2026-11-26', tasks: 1, exams: 1, minutes: 120 })
    expect(w).toMatchObject({ tasks: 3, exams: 1, minutes: 180, estimated: 2, overdue: 1, undated: 1 })
  })

  it('adds no time for a task without an estimate', () => {
    expect(w.days[0]!.minutes).toBe(60)
    expect(w.courses.find((c) => c.courseId === 'c1')).toMatchObject({ tasks: 2, minutes: 120, estimated: 1 })
  })

  it('splits each day by course in a fixed course order', () => {
    expect(w.days[0]!.byCourse.map((c) => c.courseId)).toEqual(['c1', 'c2'])
    expect(workload(tasks, NOW, 7, ['c2', 'c1']).days[0]!.byCourse.map((c) => c.courseId)).toEqual(['c2', 'c1'])
  })

  it('ranks the heaviest days by tasks or by time', () => {
    expect(heaviestDays(w.days, 'tasks').map((d) => d.key)).toEqual(['2026-11-24', '2026-11-26'])
    expect(heaviestDays(w.days, 'time').map((d) => d.key)).toEqual(['2026-11-26', '2026-11-24'])
  })
})
