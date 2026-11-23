import { useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { writeDevice } from '@/lib/storage'
import { pad2 } from '@/lib/time'
import { useNow } from '@/lib/useNow'
import {
  at,
  BREAK_RANGE,
  FOCUS_RANGE,
  fresh,
  minutes,
  POMODORO_KEY,
  PRESETS,
  readSaved,
  type Saved,
  toggle,
  type Settings,
} from '@/features/pomodoro/pomodoroState'

const PHASE = {
  focus: { label: 'Focus', color: 'var(--color-accent-fill)' },
  break: { label: 'Break', color: 'var(--color-good)' },
} as const

const RING = { size: 184, stroke: 8 }
const RADIUS = (RING.size - RING.stroke) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function PomodoroCard() {
  const id = useId()
  const [stored, setStored] = useState(readSaved)
  const ticking = stored.timer.endsAt !== null
  // Four times a second while running, so the digits turn over on time. The time itself always comes from endsAt.
  const now = useNow(ticking ? 250 : 60_000).getTime()
  const { saved, remainingMs, completed } = at(stored, now)
  const { timer } = saved
  const running = timer.endsAt !== null
  const idle = !running && timer.remainingMs === timer.durationMs
  const seconds = Math.ceil(remainingMs / 1_000)
  const left = remainingMs / timer.durationMs
  const phase = PHASE[timer.phase]
  const focusMin = minutes(saved, 'focus')
  const breakMin = minutes(saved, 'break')
  // Settings changed during an interval: say when they take effect.
  const waiting = !idle && timer.durationMs !== minutes(saved, timer.phase) * 60_000
  // Only the end of a phase is announced. The countdown itself stays quiet.
  const announcement = completed === 'focus' ? 'Focus complete. Time for a break.' : completed === 'break' ? 'Break over. Ready to focus.' : ''

  const save = (next: Saved) => {
    writeDevice(POMODORO_KEY, JSON.stringify(next))
    setStored(next)
  }

  // Another tab started, paused or changed the timer.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === POMODORO_KEY || e.key === null) setStored(readSaved())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const reset = () => save({ ...saved, timer: fresh(saved, 'focus') })
  /** Before an interval starts, new lengths show at once. During one, they wait for the next. */
  const settle = (next: Settings) => save({ ...saved, ...next, timer: idle ? fresh(next, timer.phase) : timer })

  return (
    <Card aria-label="Pomodoro timer">
      <CardHeader title="Pomodoro timer" />

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Timer lengths</legend>
        <div className="flex gap-0.5 rounded-[10px] bg-fill-strong p-0.5">
          {PRESETS.map((p) => (
            <label key={p.id} className="relative flex-1">
              <input
                type="radio"
                name={`${id}-preset`}
                value={p.id}
                checked={saved.preset === p.id}
                onChange={() => settle({ preset: p.id, custom: saved.custom })}
                className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
              />
              <span className="flex h-9 items-center justify-center rounded-[8px] text-[13px] font-medium text-muted transition-colors peer-checked:bg-thumb peer-checked:text-ink peer-checked:shadow-thumb peer-hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent pointer-coarse:h-11">
                {p.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-center text-[13px] text-muted">
        {focusMin} min focus · {breakMin} min break
      </p>

      {saved.preset === 'custom' ? (
        <div className="mt-3 flex flex-col gap-1 rounded-xl bg-fill px-4 py-2.5">
          <LengthSlider
            id={`${id}-focus`}
            label="Focus length"
            value={saved.custom.focus}
            range={FOCUS_RANGE}
            onChange={(v) => settle({ preset: 'custom', custom: { ...saved.custom, focus: v } })}
          />
          <LengthSlider
            id={`${id}-break`}
            label="Break length"
            value={saved.custom.break}
            range={BREAK_RANGE}
            onChange={(v) => settle({ preset: 'custom', custom: { ...saved.custom, break: v } })}
          />
        </div>
      ) : null}

      <div className="relative mx-auto mt-5 grid size-[184px] place-items-center">
        <svg viewBox={`0 0 ${RING.size} ${RING.size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx={RING.size / 2} cy={RING.size / 2} r={RADIUS} fill="none" stroke="var(--color-fill-strong)" strokeWidth={RING.stroke} />
          <circle
            data-testid="pomodoro-ring"
            data-left={left.toFixed(4)}
            cx={RING.size / 2}
            cy={RING.size / 2}
            r={RADIUS}
            fill="none"
            stroke={phase.color}
            strokeWidth={RING.stroke}
            strokeLinecap={left > 0 ? 'round' : 'butt'}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - left)}
          />
        </svg>
        <div className="relative flex flex-col items-center">
          <span className="text-[13px] font-semibold tracking-[0.04em] uppercase" style={{ color: phase.color }}>
            {phase.label}
          </span>
          <span role="timer" className="text-[44px] leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {pad2(Math.floor(seconds / 60))}:{pad2(seconds % 60)}
          </span>
        </div>
      </div>

      <p aria-live="polite" className="mt-3 min-h-5 text-center text-[13px] font-medium text-ink">
        {announcement}
      </p>

      <div className="mt-2 flex items-center justify-center gap-3">
        <Button size="lg" variant="primary" className="w-36" onClick={() => save(toggle(saved, Date.now()))}>
          {running ? 'Pause' : idle ? 'Start' : 'Resume'}
        </Button>
        <Button size="lg" variant="subtle" onClick={reset} disabled={idle && timer.phase === 'focus'}>
          Reset
        </Button>
      </div>
      <p className={cn('mt-2 min-h-5 text-center text-xs text-muted', !waiting && 'invisible')} aria-hidden={!waiting}>
        {waiting ? 'New lengths start with the next interval.' : 'No changes waiting.'}
      </p>
    </Card>
  )
}

function LengthSlider({
  id,
  label,
  value,
  range,
  onChange,
}: {
  id: string
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onChange: (value: number) => void
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <span className="text-[13px] font-semibold tabular-nums" aria-hidden="true">
        {value} min
      </span>
      <input
        id={id}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        aria-valuetext={`${value} minutes`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="col-span-2 h-11 w-full cursor-pointer accent-accent-fill"
      />
    </div>
  )
}
