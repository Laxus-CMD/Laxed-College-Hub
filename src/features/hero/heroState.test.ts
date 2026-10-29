import { describe, expect, it } from 'vitest'
import type { ClassSession, Task } from '@/types'
import { currentClass, getHeroState, nextClass } from './heroState'

const FND: ClassSession = { id: 'fnd', courseId: 'c1', days: [1, 4], start: '09:15', end: '10:45', room: 'UH 310' }
const MATH: ClassSession = { id: 'math', courseId: 'c2', days: [1, 4], start: '13:15', end: '14:45' }
const sessions = [FND, MATH]

// Monday, October 26 2026
const mon = (h: number, m = 0, s = 0) => new Date(2026, 9, 26, h, m, s)

const task = (id: string, due: string | undefined, done = false): Task => ({
  id,
  kind: 'assignment',
  title: id,
  due,
  done,
  source: 'manual',
})

describe('getHeroState', () => {
  it('is between classes 30 minutes before the first class', () => {
    const s = getHeroState(mon(8, 45), sessions, [])
    expect(s.kind).toBe('between-classes')
    if (s.kind === 'between-classes') {
      expect(s.next.id).toBe('fnd')
      expect(s.minutesUntil).toBe(30)
    }
  })

  it('is in class halfway through, with progress and minutes left', () => {
    const s = getHeroState(mon(10, 0), sessions, [])
    expect(s.kind).toBe('in-class')
    if (s.kind === 'in-class') {
      expect(s.session.id).toBe('fnd')
      expect(s.minutesLeft).toBe(45)
      expect(s.progress).toBeCloseTo(0.5)
    }
  })

  it('starts a class on the exact minute and ends it on the exact minute', () => {
    expect(getHeroState(mon(9, 15), sessions, []).kind).toBe('in-class')
    expect(getHeroState(mon(10, 45), sessions, []).kind).not.toBe('in-class')
  })

  it('goes to study mode when the next class is more than two hours away', () => {
    const s = getHeroState(mon(11, 0), sessions, [])
    expect(s.kind).toBe('study-mode')
    if (s.kind === 'study-mode') {
      expect(s.next?.session.id).toBe('math')
      expect(s.next?.minutesUntil).toBe(135)
    }
  })

  it('is between classes again once the next class is within two hours', () => {
    expect(getHeroState(mon(12, 0), sessions, []).kind).toBe('between-classes')
  })

  it('looks to a later day when classes are done for today', () => {
    const s = getHeroState(mon(15, 0), sessions, [])
    expect(s.kind).toBe('study-mode')
    if (s.kind === 'study-mode') {
      expect(s.next?.start.getDay()).toBe(4) // Thursday
      expect(s.next?.session.id).toBe('fnd')
    }
  })

  it('finds Monday from a Sunday', () => {
    const s = getHeroState(new Date(2026, 10, 1, 10, 0), sessions, [])
    expect(s.kind).toBe('study-mode')
    if (s.kind === 'study-mode') expect(s.next?.start.getDay()).toBe(1)
  })

  it('handles an empty schedule', () => {
    const s = getHeroState(mon(10), [], [])
    expect(s).toEqual({ kind: 'study-mode', urgentTasks: [], next: null })
  })

  it('lists urgent tasks in study mode and skips done, far off and undated ones', () => {
    const tasks = [
      task('today', '2026-10-26T17:00'),
      task('tomorrow', '2026-10-27'),
      task('far', '2026-11-20'),
      task('finished', '2026-10-26T17:00', true),
      task('undated', undefined),
    ]
    const s = getHeroState(mon(15, 0), sessions, tasks)
    expect(s.kind).toBe('study-mode')
    if (s.kind === 'study-mode') expect(s.urgentTasks.map((t) => t.id)).toEqual(['today', 'tomorrow'])
  })
})

describe('currentClass and nextClass', () => {
  it('picks the later start when two classes overlap', () => {
    const other: ClassSession = { id: 'other', courseId: 'c3', days: [1], start: '10:00', end: '11:00' }
    expect(currentClass(mon(10, 30), [FND, other])?.session.id).toBe('other')
  })

  it('returns null when nothing is on', () => {
    expect(currentClass(mon(7, 0), sessions)).toBeNull()
    expect(nextClass(mon(7, 0), [])).toBeNull()
  })
})
