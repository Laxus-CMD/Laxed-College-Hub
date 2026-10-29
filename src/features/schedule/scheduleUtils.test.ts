import { describe, expect, it } from 'vitest'
import type { ClassSession } from '@/types'
import { findConflicts, latestMeetingOnOrBefore, layoutDay, weeklyMinutes } from './scheduleUtils'

const s = (id: string, days: ClassSession['days'], start: string, end: string): ClassSession => ({
  id,
  courseId: 'c',
  days,
  start,
  end,
})

describe('layoutDay', () => {
  it('puts overlapping classes in separate lanes', () => {
    const blocks = layoutDay([s('a', [1], '09:00', '10:30'), s('b', [1], '10:00', '11:00'), s('c', [1], '13:00', '14:00')], 1)
    const by = Object.fromEntries(blocks.map((b) => [b.session.id, b]))
    expect(by.a).toMatchObject({ lane: 0, lanes: 2 })
    expect(by.b).toMatchObject({ lane: 1, lanes: 2 })
    expect(by.c).toMatchObject({ lane: 0, lanes: 1 })
  })

  it('skips sessions on other days and treats back to back classes as separate', () => {
    const blocks = layoutDay([s('a', [1], '09:00', '10:00'), s('b', [1], '10:00', '11:00'), s('t', [2], '09:00', '10:00')], 1)
    expect(blocks).toHaveLength(2)
    expect(blocks.every((b) => b.lanes === 1)).toBe(true)
  })
})

describe('findConflicts', () => {
  const existing = [s('a', [1, 4], '09:15', '10:45'), s('b', [2], '09:00', '10:00')]

  it('finds overlaps on the chosen days only', () => {
    const hits = findConflicts(existing, { days: [1, 2], start: '09:30', end: '10:30' })
    expect(hits.map((h) => [h.session.id, h.day])).toEqual([['a', 1], ['b', 2]])
  })

  it('allows touching times, ignores the edited session and bad ranges', () => {
    expect(findConflicts(existing, { days: [1], start: '10:45', end: '12:00' })).toEqual([])
    expect(findConflicts(existing, { days: [1], start: '09:30', end: '10:00' }, 'a')).toEqual([])
    expect(findConflicts(existing, { days: [1], start: '11:00', end: '10:00' })).toEqual([])
  })
})

describe('weeklyMinutes and latestMeetingOnOrBefore', () => {
  it('counts each meeting day', () => {
    expect(weeklyMinutes([s('a', [1, 4], '09:15', '10:45')])).toBe(180)
  })

  it('finds the last meeting on or before a day', () => {
    const sess = s('a', [1, 4], '09:15', '10:45')
    const thu = new Date(2026, 9, 29)
    expect(latestMeetingOnOrBefore(sess, thu)?.getDate()).toBe(29)
    expect(latestMeetingOnOrBefore(sess, new Date(2026, 9, 31))?.getDate()).toBe(29) // Saturday looks back to Thursday
    expect(latestMeetingOnOrBefore(s('x', [], '09:00', '10:00'), thu)).toBeNull()
  })
})
