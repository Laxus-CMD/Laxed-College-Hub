import type { ClassSession, HeroState, NextClass, Task, Weekday } from '@/types'
import { addDays, atMinutes, startOfDay, toMinutes } from '@/lib/time'
import { urgentTasks } from '@/features/assignments/urgency'

/** A class this close counts as "between classes". Further out is study mode. */
export const BETWEEN_WINDOW_MINUTES = 120

export interface CurrentClass {
  session: ClassSession
  start: Date
  end: Date
  minutesLeft: number
  progress: number
}

/** Real start and end for a session on a given calendar day, or null if it does not meet that day. */
export function occurrenceOn(
  session: ClassSession,
  day: Date,
): { start: Date; end: Date } | null {
  if (!session.days.includes(day.getDay() as Weekday)) return null
  const d0 = startOfDay(day)
  return {
    start: atMinutes(d0, toMinutes(session.start)),
    end: atMinutes(d0, toMinutes(session.end)),
  }
}

export function currentClass(now: Date, sessions: ClassSession[]): CurrentClass | null {
  let best: CurrentClass | null = null
  for (const session of sessions) {
    const occ = occurrenceOn(session, now)
    if (!occ || occ.start > now || now >= occ.end) continue
    if (best && occ.start <= best.start) continue
    const span = occ.end.getTime() - occ.start.getTime()
    best = {
      session,
      start: occ.start,
      end: occ.end,
      minutesLeft: Math.ceil((occ.end.getTime() - now.getTime()) / 60_000),
      progress: span > 0 ? (now.getTime() - occ.start.getTime()) / span : 0,
    }
  }
  return best
}

/** The soonest class that has not started yet, looking `horizonDays` ahead. */
export function nextClass(now: Date, sessions: ClassSession[], horizonDays = 7): NextClass | null {
  let best: NextClass | null = null
  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = addDays(startOfDay(now), offset)
    for (const session of sessions) {
      const occ = occurrenceOn(session, day)
      if (!occ || occ.start <= now) continue
      if (best && occ.start >= best.start) continue
      best = {
        session,
        start: occ.start,
        end: occ.end,
        minutesUntil: Math.ceil((occ.start.getTime() - now.getTime()) / 60_000),
      }
    }
    if (best) break // days are walked in order, so the first hit is the soonest
  }
  return best
}

/**
 * What the hero banner should show right now.
 * Pure: the clock is an argument, never read inside.
 */
export function getHeroState(now: Date, sessions: ClassSession[], tasks: Task[]): HeroState {
  const current = currentClass(now, sessions)
  if (current) {
    return {
      kind: 'in-class',
      session: current.session,
      start: current.start,
      end: current.end,
      minutesLeft: current.minutesLeft,
      progress: current.progress,
    }
  }
  const next = nextClass(now, sessions)
  const sameDay = next ? startOfDay(next.start).getTime() === startOfDay(now).getTime() : false
  if (next && sameDay && next.minutesUntil <= BETWEEN_WINDOW_MINUTES) {
    return {
      kind: 'between-classes',
      next: next.session,
      start: next.start,
      minutesUntil: next.minutesUntil,
    }
  }
  return { kind: 'study-mode', urgentTasks: urgentTasks(tasks, now), next }
}
