import { readDevice } from '@/lib/storage'
import { dateKey } from '@/lib/time'

/**
 * The Pomodoro timer's settings and state, as plain data and pure functions.
 * The time left is never counted down: it is always worked out from `endsAt` and the
 * clock, so the digits and the ring agree, and the timer stays right while the tab
 * sleeps in the background.
 */

/** Kept in this browser only. A timer belongs to the device it is running on. */
export const POMODORO_KEY = 'college-hub.pomodoro'

export type Preset = 'classic' | 'long' | 'custom'
export type Phase = 'focus' | 'break'

export const PRESETS: { id: Preset; label: string; focus?: number; break?: number }[] = [
  { id: 'classic', label: '25/5', focus: 25, break: 5 },
  { id: 'long', label: '50/10', focus: 50, break: 10 },
  { id: 'custom', label: 'Custom' },
]
export const FOCUS_RANGE = { min: 5, max: 120, step: 5 }
export const BREAK_RANGE = { min: 1, max: 30, step: 1 }

export interface Timer {
  phase: Phase
  /** How long this interval is. Fixed when the interval begins, so new settings wait for the next one. */
  durationMs: number
  /** Time left when it was last paused, or when it started. */
  remainingMs: number
  /** When it reaches zero while running, or null while stopped. */
  endsAt: number | null
  /**
   * Who started or last resumed it: an account id or "guest". The finished session is
   * theirs, even if someone else is signed in when it ends. Missing on older timers.
   */
  by?: string
}

export interface Settings {
  preset: Preset
  custom: { focus: number; break: number }
}

export interface Saved extends Settings {
  v: 2
  timer: Timer
  /** Focus intervals finished on a given day. Optional, so timers saved before it existed still load. */
  done?: { day: string; count: number }
}

export function minutes(s: Settings, phase: Phase): number {
  const p = PRESETS.find((x) => x.id === s.preset)
  return (phase === 'focus' ? p?.focus : p?.break) ?? s.custom[phase]
}

export function fresh(s: Settings, phase: Phase): Timer {
  const ms = minutes(s, phase) * 60_000
  return { phase, durationMs: ms, remainingMs: ms, endsAt: null }
}

const DEFAULTS: Settings = { preset: 'classic', custom: { focus: 25, break: 5 } }
export const firstSaved = (): Saved => ({ v: 2, ...DEFAULTS, custom: { ...DEFAULTS.custom }, timer: fresh(DEFAULTS, 'focus') })

const inRange = (n: unknown, r: { min: number; max: number }): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= r.min && n <= r.max
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** What this browser saved. Anything missing, from an older version, or odd starts fresh at 25/5. */
export function readSaved(): Saved {
  try {
    const s = JSON.parse(readDevice(POMODORO_KEY) ?? 'null') as Partial<Saved> | null
    const t = s?.timer
    if (
      s?.v === 2 &&
      PRESETS.some((p) => p.id === s.preset) &&
      inRange(s.custom?.focus, FOCUS_RANGE) &&
      inRange(s.custom?.break, BREAK_RANGE) &&
      t &&
      (t.phase === 'focus' || t.phase === 'break') &&
      finite(t.durationMs) &&
      t.durationMs > 0 &&
      finite(t.remainingMs) &&
      t.remainingMs > 0 &&
      t.remainingMs <= t.durationMs &&
      (t.endsAt === null || (finite(t.endsAt) && t.endsAt > 0))
    ) {
      const d = s.done
      const done = d && typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day) && Number.isInteger(d.count) && d.count >= 0 && d.count < 1000 ? { day: d.day, count: d.count } : undefined
      const by = typeof t.by === 'string' && t.by.length > 0 && t.by.length <= 64 ? t.by : undefined
      const timer: Timer = { phase: t.phase, durationMs: t.durationMs, remainingMs: t.remainingMs, endsAt: t.endsAt, ...(by ? { by } : {}) }
      return { v: 2, preset: s.preset!, custom: { focus: s.custom!.focus, break: s.custom!.break }, timer, ...(done ? { done } : {}) }
    }
  } catch {
    // Unreadable: start fresh.
  }
  return firstSaved()
}

/**
 * The timer as it is at `now`. A running interval that has reached zero has already
 * become the other phase, ready to start, and `completed` says which phase just ended.
 * The next phase never starts by itself.
 */
export function at(saved: Saved, now: number): { saved: Saved; remainingMs: number; completed: Phase | null } {
  const t = saved.timer
  if (t.endsAt === null) return { saved, remainingMs: t.remainingMs, completed: null }
  const remainingMs = Math.max(0, Math.min(t.remainingMs, t.endsAt - now))
  if (remainingMs > 0) return { saved, remainingMs, completed: null }
  const next = fresh(saved, t.phase === 'focus' ? 'break' : 'focus')
  // A finished focus interval counts toward the day it ended on, even if nobody was looking.
  const done = t.phase === 'focus' ? countOn(saved, dateKey(new Date(t.endsAt))) : saved.done
  return { saved: { ...saved, timer: next, ...(done ? { done } : {}) }, remainingMs: next.remainingMs, completed: t.phase }
}

function countOn(saved: Saved, day: string): { day: string; count: number } {
  return { day, count: (saved.done?.day === day ? saved.done.count : 0) + 1 }
}

/** Focus intervals finished today. */
export function finishedToday(saved: Saved, now: number): number {
  return saved.done?.day === dateKey(new Date(now)) ? saved.done.count : 0
}

/**
 * Start, pause or resume, at `time`, by `by`. Pausing keeps the exact time left.
 * A focus interval someone else paused part way is theirs: another person starts a fresh one
 * instead of resuming it, so nobody is credited with someone else's study time. The same goes
 * for one with no known owner, saved before owners were kept.
 */
export function toggle(saved: Saved, time: number, by?: string): Saved {
  const t = saved.timer
  if (t.endsAt !== null) return { ...saved, timer: { ...t, remainingMs: Math.max(1, Math.min(t.remainingMs, t.endsAt - time)), endsAt: null } }
  // That includes a timer saved before owners were kept: whose time it was is unknown.
  if (t.phase === 'focus' && by && t.by !== by && t.remainingMs < t.durationMs) {
    return { ...saved, timer: { ...fresh(saved, 'focus'), endsAt: time + minutes(saved, 'focus') * 60_000, by } }
  }
  const { by: _before, ...rest } = t
  return { ...saved, timer: { ...rest, endsAt: time + t.remainingMs, ...(by ? { by } : {}) } }
}

/**
 * "Start studying" or "Continue", at `time`. Expects a timer already brought up to date
 * with at(), so an interval that ran out is never resumed. A running interval is left as
 * it is. A focus interval that is ready or paused starts or resumes. A break that has not
 * started gives way to a new focus interval: the student asked to study.
 */
export function studyNow(saved: Saved, time: number, by?: string): Saved {
  const t = saved.timer
  if (t.endsAt !== null) return saved
  if (t.phase === 'focus') return toggle(saved, time, by)
  return toggle({ ...saved, timer: fresh(saved, 'focus') }, time, by)
}
