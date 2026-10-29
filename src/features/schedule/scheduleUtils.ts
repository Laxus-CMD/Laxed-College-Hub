import type { ClassSession, Weekday } from '@/types'
import { toMinutes } from '@/lib/time'

export interface DayBlock {
  session: ClassSession
  start: number // minutes after midnight
  end: number
  /** Which side-by-side lane this block sits in, from 0. */
  lane: number
  /** How many lanes its overlapping group needs. */
  lanes: number
}

/** Sessions that meet on a weekday, laid out so overlapping ones sit side by side. */
export function layoutDay(sessions: ClassSession[], day: Weekday): DayBlock[] {
  const items = sessions
    .filter((s) => s.days.includes(day))
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

/** Existing sessions that overlap a proposed time on any of the given days. */
export function findConflicts(
  sessions: ClassSession[],
  proposed: { days: Weekday[]; start: string; end: string },
  ignoreId?: string,
): { session: ClassSession; day: Weekday }[] {
  const s = toMinutes(proposed.start)
  const e = toMinutes(proposed.end)
  if (e <= s) return []
  const hits: { session: ClassSession; day: Weekday }[] = []
  for (const day of proposed.days) {
    for (const session of sessions) {
      if (session.id === ignoreId || !session.days.includes(day)) continue
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
  for (let back = 0; back < 7; back++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)
    if (session.days.includes(d.getDay() as Weekday)) return d
  }
  return null
}
