import { describe, expect, it } from 'vitest'
import {
  dayDiff,
  formatDuration,
  formatRange,
  fromMinutes,
  parseLocalIso,
  startOfWeek,
  toLocalIso,
  toMinutes,
} from './time'

describe('time helpers', () => {
  it('converts between "HH:mm" and minutes', () => {
    expect(toMinutes('09:15')).toBe(555)
    expect(fromMinutes(555)).toBe('09:15')
    expect(fromMinutes(1440)).toBe('00:00')
  })

  it('formats ranges and drops the repeated AM/PM', () => {
    expect(formatRange('09:15', '10:45')).toBe('9:15 to 10:45 AM')
    expect(formatRange('11:30', '13:00')).toBe('11:30 AM to 1:00 PM')
    expect(formatRange('00:00', '00:30')).toBe('12:00 to 12:30 AM')
  })

  it('treats a bare date as the end of that day', () => {
    const d = parseLocalIso('2026-10-30')
    expect(d.getHours()).toBe(23)
    expect(d.getMinutes()).toBe(59)
    expect(toLocalIso(parseLocalIso('2026-10-30T07:05'))).toBe('2026-10-30T07:05')
  })

  it('counts calendar days across a month end', () => {
    expect(dayDiff(new Date(2026, 10, 2, 1), new Date(2026, 9, 30, 23))).toBe(3)
    expect(dayDiff(new Date(2026, 9, 30), new Date(2026, 9, 30, 23, 59))).toBe(0)
  })

  it('finds the Monday of a week, including from a Sunday', () => {
    expect(startOfWeek(new Date(2026, 9, 29)).getDate()).toBe(26) // Thursday
    expect(startOfWeek(new Date(2026, 10, 1)).getDate()).toBe(26) // Sunday belongs to the week before
  })

  it('writes durations in words', () => {
    expect(formatDuration(1)).toBe('1 minute')
    expect(formatDuration(45)).toBe('45 minutes')
    expect(formatDuration(120)).toBe('2 hours')
    expect(formatDuration(135)).toBe('2 h 15 min')
  })
})
