import type { ClassSession, Weekday } from '@/types'
import { addDays, dateKey, parseDateKey, toMinutes } from '@/lib/time'

/** Whether the class's term covers this calendar day. Classes without term dates always do. */
export function inTerm(session: ClassSession, day: Date): boolean {
  const key = dateKey(day)
  return (!session.startsOn || session.startsOn <= key) && (!session.endsOn || key <= session.endsOn)
}

/** Whether the class meets on this calendar day: the right weekday, within its term. */
export function meetsOn(session: ClassSession, day: Date): boolean {
  return session.days.includes(day.getDay() as Weekday) && inTerm(session, day)
}

/** Classes still running: not ended before `today`. Upcoming terms count. */
export function currentSessions(sessions: ClassSession[], today: Date): ClassSession[] {
  const key = dateKey(today)
  return sessions.filter((s) => !s.endsOn || s.endsOn >= key)
}

export interface DayBlock {
  session: ClassSession
  start: number // minutes after midnight
  end: number
  /** Which side-by-side lane this block sits in, from 0. */
  lane: number
  /** How many lanes its overlapping group needs. */
  lanes: number
}

/**
 * Sessions that meet on a day, laid out so overlapping ones sit side by side. Given a date,
 * only classes whose term covers it; given a weekday alone, every class meeting that weekday.
 */
export function layoutDay(sessions: ClassSession[], day: Weekday | Date): DayBlock[] {
  const items = sessions
    .filter((s) => (typeof day === 'number' ? s.days.includes(day) : meetsOn(s, day)))
    .map((session) => ({ session, start: toMinutes(session.start), end: toMinutes(session.end) }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const blocks: DayBlock[] = []
  let group: DayBlock[] = []
  let groupEnd = -1

  const flush = () => {
    const lanes = group.reduce((m, b) => Math.max(m, b.lane + 1), 1)
    for (const b of group) b.lanes = lanes
    blocks.push(...group)
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
  return blocks
}

/**
 * Existing sessions that overlap a proposed time on any of the given days, during the
 * proposed term. Classes from a term that does not overlap it never conflict.
 */
export function findConflicts(
  sessions: ClassSession[],
  proposed: { days: Weekday[]; start: string; end: string; startsOn?: string | null; endsOn?: string | null },
  ignoreId?: string,
): { session: ClassSession; day: Weekday }[] {
  const s = toMinutes(proposed.start)
  const e = toMinutes(proposed.end)
  if (e <= s) return []
  const termsOverlap = (other: ClassSession) =>
    (!proposed.startsOn || !other.endsOn || other.endsOn >= proposed.startsOn) &&
    (!proposed.endsOn || !other.startsOn || other.startsOn <= proposed.endsOn)
  const hits: { session: ClassSession; day: Weekday }[] = []
  for (const day of proposed.days) {
    for (const session of sessions) {
      if (session.id === ignoreId || !session.days.includes(day) || !termsOverlap(session)) continue
      if (toMinutes(session.start) < e && toMinutes(session.end) > s) hits.push({ session, day })
    }
  }
  return hits
}

/** Total weekly class time in minutes. A session meeting on two days counts twice. */
export function weeklyMinutes(sessions: ClassSession[]): number {
  return sessions.reduce((sum, s) => sum + (toMinutes(s.end) - toMinutes(s.start)) * s.days.length, 0)
}

/** The most recent meeting of a session on or before `today`, as a Date at midnight. Null if it never met. */
export function latestMeetingOnOrBefore(session: ClassSession, today: Date): Date | null {
  // An ended class: look back from its last day.
  const last = session.endsOn ? parseDateKey(session.endsOn) : null
  const from = last && last < today ? last : today
  for (let back = 0; back < 7; back++) {
    const d = addDays(new Date(from.getFullYear(), from.getMonth(), from.getDate()), -back)
    if (meetsOn(session, d)) return d
  }
  return null
}
