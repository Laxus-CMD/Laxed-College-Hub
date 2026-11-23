import { readDevice } from '@/lib/storage'

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
}

export interface Settings {
  preset: Preset
  custom: { focus: number; break: number }
}

export interface Saved extends Settings {
  v: 2
  timer: Timer
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
      return { v: 2, preset: s.preset!, custom: { focus: s.custom!.focus, break: s.custom!.break }, timer: { ...t } }
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
  return { saved: { ...saved, timer: next }, remainingMs: next.remainingMs, completed: t.phase }
}

/** Start, pause or resume, at `time`. Pausing keeps the exact time left. */
export function toggle(saved: Saved, time: number): Saved {
  const t = saved.timer
  if (t.endsAt !== null) return { ...saved, timer: { ...t, remainingMs: Math.max(1, Math.min(t.remainingMs, t.endsAt - time)), endsAt: null } }
  return { ...saved, timer: { ...t, endsAt: time + t.remainingMs } }
}
