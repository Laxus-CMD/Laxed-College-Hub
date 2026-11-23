import { FocusSpace } from './FocusSpace'
import { useEffect, useId, useState } from 'react'
import { ChevronDown, Pause, Play, RotateCcw } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { writeDevice } from '@/lib/storage'
import { formatClock, pad2 } from '@/lib/time'
import { useFocusTask, useTimerNow } from '@/features/pomodoro/focusTask'
import {
  at,
  BREAK_RANGE,
  finishedToday,
  FOCUS_RANGE,
  fresh,
  minutes,
  POMODORO_KEY,
  PRESETS,
  readSaved,
  toggle,
  type Saved,
  type Settings,
} from '@/features/pomodoro/pomodoroState'

const PHASE = {
  focus: { label: 'Focus', color: 'var(--color-accent-fill)' },
  break: { label: 'Break', color: 'var(--color-good)' },
} as const

/** A thin, quiet ring. Sizes are in SVG units; the ring scales with its box. */
const RING = { size: 220, track: 3, stroke: 5 }
const RADIUS = (RING.size - RING.stroke) / 2 - 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/** Focus sessions per round, shown as dots. */
const ROUND = 4

export function PomodoroCard() {
  const id = useId()
  const [stored, setStored] = useState(readSaved)
  const [adjusting, setAdjusting] = useState(false)
  const task = useFocusTask((s) => s.task)
  const setTask = useFocusTask((s) => s.setTask)
  // Fast only until the stored deadline; an ended phase refreshes at the idle rate.
  const now = useTimerNow(stored.timer.endsAt)
  const { saved, remainingMs, completed } = at(stored, now)
  const { timer } = saved
  const running = timer.endsAt !== null
  const idle = !running && timer.remainingMs === timer.durationMs
  const seconds = Math.ceil(remainingMs / 1_000)
  const left = remainingMs / timer.durationMs
  const phase = PHASE[timer.phase]
  const focusMin = minutes(saved, 'focus')
  const breakMin = minutes(saved, 'break')
  const custom = saved.preset === 'custom'
  const presetIndex = PRESETS.findIndex((p) => p.id === saved.preset)
  const finished = finishedToday(saved, now)
  const inRound = finished === 0 ? 0 : ((finished - 1) % ROUND) + 1
  // Settings changed during an interval: say when they take effect.
  const waiting = !idle && timer.durationMs !== minutes(saved, timer.phase) * 60_000
  // Only the end of a phase is announced. The countdown itself stays quiet.
  const announcement = completed === 'focus' ? 'Focus complete. Time for a break.' : completed === 'break' ? 'Break over. Ready to focus.' : ''
  const caption = running
    ? `Ends at ${formatClock(new Date(timer.endsAt!).getHours() * 60 + new Date(timer.endsAt!).getMinutes())}`
    : idle
      ? `${Math.round(timer.durationMs / 60_000)} min ${timer.phase === 'focus' ? 'focus' : 'break'}`
      : 'Paused'

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
  const choose = (preset: Settings['preset']) => {
    // Picking Custom opens its lengths; picking a preset tucks them away.
    setAdjusting(preset === 'custom')
    settle({ preset, custom: saved.custom })
  }

  const toggleTimer = () => {
    const time = Date.now()
    save(toggle(at(stored, time).saved, time))
  }
  const clockFace = (immersive: boolean) => (
    <>
      {/* The focal point: one ring, one countdown. */}
      <div className={immersive ? "relative mx-auto aspect-square w-[min(78vw,52svh,460px)]" : "relative mx-auto aspect-square w-full max-w-[236px]"}>
        <svg viewBox={`0 0 ${RING.size} ${RING.size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx={RING.size / 2} cy={RING.size / 2} r={RADIUS} fill="none" stroke="var(--color-fill-strong)" strokeWidth={RING.track} />
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
            // Glides between ticks while running; jumps when reset or when the phase changes.
            className={cn('transition-[stroke] duration-500', running && 'transition-[stroke-dashoffset,stroke] duration-[250ms,500ms] ease-linear')}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase transition-colors duration-500" style={{ color: timer.phase === 'focus' ? 'var(--color-accent)' : 'var(--color-good)' }}>
            {phase.label}
          </span>
          <span role="timer" className={cn("mt-0.5 leading-none font-light tracking-[-0.04em] tabular-nums", immersive ? "text-[clamp(2.5rem,min(14vw,10svh),6rem)]" : "text-[56px]")}>
            {pad2(Math.floor(seconds / 60))}:{pad2(seconds % 60)}
          </span>
          <span className="mt-2 text-xs text-muted tabular-nums">{caption}</span>
        </div>
      </div>

    </>
  )

  const timerControls = (
    <>
      <p aria-live="polite" className="mt-2 min-h-5 text-center text-[13px] font-medium text-ink">
        {announcement}
      </p>

      {/* The main action in the middle, Reset quietly to one side. */}
      <div className="mx-auto mt-1 grid w-full max-w-sm grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3">
        <button
          type="button"
          aria-label="Reset"
          title="Reset"
          onClick={reset}
          disabled={idle && timer.phase === 'focus'}
          className="grid size-11 cursor-pointer place-items-center rounded-full bg-fill text-muted transition-[background-color,color,transform,opacity] duration-150 hover:bg-fill-strong hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-35"
        >
          <RotateCcw className="size-[18px]" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={toggleTimer}
          // Flat sage in both phases: the label and the ring already say which one it is.
          className="mx-auto inline-flex h-12 w-full max-w-[180px] cursor-pointer items-center justify-center gap-2 rounded-full bg-accent-fill text-[15px] font-semibold text-on-accent transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.97]"
        >
          {running ? <Pause className="size-[18px]" fill="currentColor" aria-hidden="true" /> : <Play className="size-[18px]" fill="currentColor" aria-hidden="true" />}
          {running ? 'Pause' : idle ? 'Start' : 'Resume'}
        </button>
        <span aria-hidden="true" />
      </div>

    </>
  )

  return (
    <Card aria-label="Pomodoro timer" className="pomodoro-card min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Pomodoro timer</h3>
        <div className="flex items-center gap-2 ml-auto" role="img" aria-label={`${finished} focus ${finished === 1 ? 'session' : 'sessions'} finished today`}>
          <span className="flex gap-1" aria-hidden="true">
            {Array.from({ length: ROUND }, (_, i) => (
              <i
                key={i}
                className={cn(
                  'size-1.5 rounded-full transition-[background-color,transform] duration-300 ease-(--ease-spring)',
                  i < inRound ? 'scale-110 bg-accent-fill' : 'bg-fill-strong',
                )}
              />
            ))}
          </span>
          {finished > 0 ? (
            <span className="text-xs text-muted tabular-nums" aria-hidden="true">
              {finished} today
            </span>
          ) : null}
        </div>
        <FocusSpace tone={timer.phase === 'focus' ? 'focus' : timer.durationMs >= 10 * 60_000 ? 'long-break' : 'short-break'} onToggleTimer={toggleTimer}>
          <input type="text" aria-label="Current task" placeholder="Add a task (optional)" maxLength={160}
            value={task} onChange={(event) => setTask(event.target.value)}
            className="min-h-11 w-full max-w-sm rounded-lg bg-transparent px-3 text-center text-lg text-ink placeholder:text-muted focus:bg-fill" />
          {clockFace(true)}
          {timerControls}
          <span className="text-sm text-muted">{finished} focus {finished === 1 ? 'session' : 'sessions'} today</span>
        </FocusSpace>
      </div>

      <div className="pomodoro-layout">
        {clockFace(false)}
        <div className="pomodoro-details">
          {/* Presets: a segmented control with a sliding thumb. Native radios, so arrow keys work. */}
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="sr-only">Timer lengths</legend>
            <div className="pomodoro-presets relative grid grid-cols-3 rounded-[11px] bg-fill p-[3px]">
              <span
                aria-hidden="true"
                className="absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/3)] rounded-[8px] bg-thumb shadow-thumb transition-transform duration-300 ease-(--ease-apple)"
                style={{ transform: `translateX(${presetIndex * 100}%)` }}
              />
              {PRESETS.map((p) => (
                <label key={p.id} className="relative">
                  <input
                    type="radio"
                    name={`${id}-preset`}
                    value={p.id}
                    checked={saved.preset === p.id}
                    onChange={() => choose(p.id)}
                    className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-[8px] text-[13px] font-medium text-muted transition-colors duration-200 peer-checked:text-ink peer-hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent pointer-coarse:h-11">
                    {p.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-2.5 flex min-h-7 items-center justify-center gap-1.5 text-[13px] text-muted">
            <span>
              {focusMin} min focus · {breakMin} min break
            </span>
            {custom ? (
              <button
                type="button"
                aria-expanded={adjusting}
                aria-controls={`${id}-lengths`}
                onClick={() => setAdjusting((v) => !v)}
                className="-my-1 inline-flex h-7 cursor-pointer items-center gap-0.5 rounded-full px-2 font-medium text-accent transition-colors hover:bg-fill"
              >
                {adjusting ? 'Done' : 'Adjust'}
                <ChevronDown className={cn('size-3.5 transition-transform duration-300', adjusting && 'rotate-180')} aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {/* Custom lengths fold away under the presets. */}
          <div
            id={`${id}-lengths`}
            className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-(--ease-apple)', custom && adjusting ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
          >
            <div className="min-h-0 overflow-hidden">
              {custom && adjusting ? (
                <div className="mt-2 flex flex-col gap-1 rounded-2xl bg-fill px-4 py-3">
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
            </div>
          </div>
          {timerControls}
        </div>
      </div>

      <p className={cn('mt-3 min-h-5 text-center text-xs text-muted', !waiting && 'invisible')} aria-hidden={!waiting}>
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
  const fill = ((value - range.min) / (range.max - range.min)) * 100
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <span className="text-[13px] font-semibold text-accent tabular-nums" aria-hidden="true">
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
        className="range col-span-2 h-11 w-full"
        style={{ ['--fill' as string]: `${fill}%` }}
      />
    </div>
  )
}
