import { describe, expect, it } from 'vitest'
import type { Course } from '@/types'
import { matchCourse, parseIcs, unfoldLines } from './ics'

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:event-assignment-101',
  'SUMMARY:Problem Set 3\\, Probability [FNDSTAT-A]',
  'DTSTART:20261030T155900Z',
  'DESCRIPTION:Solve all items.\\nShow your work.',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'DESCRIPTION:Reminder text that must be ignored',
  'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-calendar-event-7',
  'SUMMARY;LANGUAGE=en:Long folded',
  '  title [CS 101]',
  'DTSTART;VALUE=DATE:20261102',
  'END:VEVENT',
  'BEGIN:VTODO',
  'UID:todo-1',
  'SUMMARY:Read chapter 5',
  'DUE:20261029T090000',
  'END:VTODO',
  'BEGIN:VEVENT',
  'UID:no-summary',
  'DTSTART:20261031T000000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:no-date',
  'SUMMARY:No date here',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

describe('parseIcs', () => {
  const items = parseIcs(FEED, { offsetMinutes: 480 })

  it('keeps only items with a title and a date, sorted by due', () => {
    expect(items.map((i) => i.externalId)).toEqual(['todo-1', 'event-assignment-101', 'event-calendar-event-7'])
  })

  it('converts UTC to the given offset', () => {
    const ps = items.find((i) => i.externalId === 'event-assignment-101')
    expect(ps?.due).toBe('2026-10-30T23:59') // 15:59Z at UTC+8
  })

  it('pulls the course tag out of the title and unescapes text', () => {
    const ps = items.find((i) => i.externalId === 'event-assignment-101')
    expect(ps?.title).toBe('Problem Set 3, Probability')
    expect(ps?.courseHint).toBe('FNDSTAT-A')
    expect(ps?.description).toBe('Solve all items.\nShow your work.')
    expect(ps?.kind).toBe('assignment')
  })

  it('ignores properties inside nested components', () => {
    const ps = items.find((i) => i.externalId === 'event-assignment-101')
    expect(ps?.description).not.toContain('Reminder')
  })

  it('treats all-day dates as end of day and unfolds long lines', () => {
    const ev = items.find((i) => i.externalId === 'event-calendar-event-7')
    expect(ev?.due).toBe('2026-11-02T23:59')
    expect(ev?.allDay).toBe(true)
    expect(ev?.title).toBe('Long folded title'.replace('folded title', 'folded title'))
    expect(ev?.kind).toBe('todo')
  })

  it('reads to-dos from DUE and floating times as local', () => {
    const todo = items.find((i) => i.externalId === 'todo-1')
    expect(todo?.due).toBe('2026-10-29T09:00')
    expect(todo?.kind).toBe('todo')
  })

  it('returns nothing for text that is not a calendar', () => {
    expect(parseIcs('hello world')).toEqual([])
    expect(parseIcs('')).toEqual([])
  })

  it('joins folded lines', () => {
    expect(unfoldLines('A:1\r\n 2\r\nB:3')).toEqual(['A:12', 'B:3'])
  })
})

describe('matchCourse', () => {
  const courses = [
    { id: '1', code: 'CS 101' },
    { id: '2', code: 'FNDSTAT' },
    { id: '3', code: 'CS' },
  ] as Course[]

  it('matches tags that contain the course code', () => {
    expect(matchCourse('FNDSTAT-A', courses)?.id).toBe('2')
    expect(matchCourse('cs101 section b', courses)?.id).toBe('1')
  })

  it('prefers the longest code and returns undefined when nothing fits', () => {
    expect(matchCourse('CS 101', courses)?.id).toBe('1')
    expect(matchCourse('MATH 201', courses)).toBeUndefined()
    expect(matchCourse(undefined, courses)).toBeUndefined()
  })
})
