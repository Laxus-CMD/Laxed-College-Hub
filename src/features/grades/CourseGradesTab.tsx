import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { AlertCircle, Check, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dot, Pill } from '@/components/ui/Chip'
import { Input, Select } from '@/components/ui/Field'
import { FilterChip } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import {
  DEFAULT_TOTAL,
  GRADE_POINTS,
  minPercentFor,
  neededAverage,
  percentToGrade,
  projectFinal,
  scorePercent,
  summarize,
  totalProblem,
} from '@/features/grades/gradeMath'
import { deleteComponent, restoreComponent, type RemovedComponent } from '@/store/actions'
import { useGradeStore } from '@/store/useGradeStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import type { GradeComponent } from '@/types'

const trim = (n: number) => String(Number(n.toFixed(1)))
const parse = (v: string): number | null => (v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const TARGETS = GRADE_POINTS.filter((g) => g > 0)

type Field = 'weight' | 'score' | 'total'

/** Blank is null. Anything that is not a number is NaN, so it can be explained instead of dropped. */
function read(text: string): number | null {
  const t = text.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}

/** What is wrong with what the student typed, if anything. */
function problem(field: Field, text: string): string | null {
  const n = read(text)
  if (Number.isNaN(n)) return 'Enter a number.'
  if (n === null) return null
  if (field === 'total') return totalProblem(n)
  if (n < 0) return field === 'weight' ? 'Weight cannot be negative.' : 'Points earned cannot be negative.'
  return null
}

const shown = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

/** A labeled number box. The label stays visible at every width. */
function NumberField({
  id,
  label,
  name,
  text,
  error,
  placeholder,
  suffix,
  describedBy,
  onText,
  onDone,
}: {
  id: string
  label: string
  /** Which component this belongs to, for screen readers. */
  name: string
  text: string
  error: string | null
  placeholder?: string
  suffix?: ReactNode
  describedBy: string
  onText: (text: string) => void
  onDone: () => void
}) {
  return (
    <div className="flex w-[6.5rem] flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`${label} for ${name}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error ${describedBy}` : describedBy}
          placeholder={placeholder}
          className={cn(
            'h-11 w-full bg-surface text-right text-[15px] font-medium tabular-nums aria-invalid:border-bad aria-invalid:focus:border-bad aria-invalid:focus:ring-bad/15',
            suffix ? 'pr-7' : undefined,
          )}
          value={text}
          onChange={(e) => onText(e.target.value)}
          onBlur={onDone}
        />
        {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">{suffix}</span> : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs leading-snug text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function CourseGradesTab() {
  const courses = useScheduleStore((s) => s.courses)
  const allComponents = useGradeStore((s) => s.components)
  const scale = useGradeStore((s) => s.scale)
  const targets = useGradeStore((s) => s.targets)
  const addComponent = useGradeStore((s) => s.addComponent)
  const updateComponent = useGradeStore((s) => s.updateComponent)
  const setTarget = useGradeStore((s) => s.setTarget)
  const setScaleMin = useGradeStore((s) => s.setScaleMin)
  const resetScale = useGradeStore((s) => s.resetScale)

  const [picked, setPicked] = useState<string>('')
  const [whatIf, setWhatIf] = useState<Record<string, number>>({})
  /** What the student is typing, by "componentId:field". Lets a box be blank or wrong while they edit. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  /** The component just removed, shown in its place with Undo until the next removal or course. */
  const [removed, setRemoved] = useState<(RemovedComponent & { at: number }) | null>(null)
  /** The one component being edited. The rest show their results. */
  const [open, setOpen] = useState<string | null>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<string | null>(null)
  const focusName = useRef<string | null>(null)
  const course = courses.find((c) => c.id === picked) ?? courses[0]

  // Keyboard focus follows the action: to Undo after a removal, back to the row after Undo,
  // and into the name of a component that was just added.
  useEffect(() => {
    if (removed) undoRef.current?.focus()
    else if (returnTo.current) {
      document.getElementById(`toggle-${returnTo.current}`)?.focus()
      returnTo.current = null
    }
  }, [removed])
  useEffect(() => {
    if (open && focusName.current === open) {
      document.getElementById(`name-${open}`)?.focus()
      focusName.current = null
    }
  }, [open])

  const components = useMemo(() => allComponents.filter((c) => c.courseId === course?.id), [allComponents, course?.id])

  const draftOf = (c: GradeComponent, field: Field): string | undefined => drafts[`${c.id}:${field}`]
  const textOf = (c: GradeComponent, field: Field): string =>
    draftOf(c, field) ?? shown(field === 'weight' ? c.weight : field === 'score' ? c.score : c.totalScore)
  const errorOf = (c: GradeComponent, field: Field): string | null => {
    const draft = draftOf(c, field)
    return draft === undefined ? (field === 'total' ? totalProblem(c.totalScore) : null) : problem(field, draft)
  }
  const hasError = (c: GradeComponent) => (['weight', 'score', 'total'] as const).some((f) => errorOf(c, f))

  // A component with a mistake in it is left out of every calculation: it is neither graded nor
  // remaining work, and gets no what-if. Components that are simply not graded yet still count.
  const held = components.filter(hasError)
  const usable = components.filter((c) => !hasError(c))
  const heldNames = held.map((c) => c.name.trim() || 'a component').join(', ')
  const summary = summarize(usable)
  /** Weight as entered, for the "adds up to 100%" check. A box being fixed does not change it. */
  const enteredWeight = summarize(components).totalWeight
  const target = (course && targets[course.id]) ?? 3
  const need = neededAverage(usable, minPercentFor(target, scale))
  const grade = summary.average === null ? null : percentToGrade(summary.average, scale)
  const ungraded = usable.filter((c) => scorePercent(c) === null)
  const projected = projectFinal(usable, whatIf)
  const baseline = projectFinal(usable)
  const touched = ungraded.some((c) => whatIf[c.id] !== undefined)

  if (!course) return null
  const weightOff = Math.abs(enteredWeight - 100) > 0.05
  const graded = usable.length - ungraded.length

  const remove = (c: GradeComponent) => {
    const at = components.findIndex((x) => x.id === c.id)
    const r = deleteComponent(c.id)
    if (r) setRemoved({ ...r, at })
    setOpen(null)
  }
  const undo = () => {
    if (!removed) return
    restoreComponent(removed)
    returnTo.current = removed.component.id
    setRemoved(null)
  }
  const add = () => {
    const id = addComponent(course.id)
    focusName.current = id
    setRemoved(null)
    setOpen(id)
  }

  const edit = (c: GradeComponent, field: Field, text: string) => {
    setDrafts((d) => ({ ...d, [`${c.id}:${field}`]: text }))
    if (problem(field, text)) return
    const n = read(text)
    if (field === 'weight') updateComponent(c.id, { weight: n ?? 0 })
    else if (field === 'score') updateComponent(c.id, { score: n })
    else updateComponent(c.id, { totalScore: n })
  }
  /** Leaving a box tidies it, unless it still needs fixing. */
  const done = (c: GradeComponent, field: Field) => {
    const key = `${c.id}:${field}`
    if (drafts[key] !== undefined && !problem(field, drafts[key]!)) {
      setDrafts(({ [key]: _gone, ...rest }) => rest)
    }
  }
  /** Escape closes the editor and puts the keyboard back on the row. */
  const closeOnEscape = (c: GradeComponent) => (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    setOpen(null)
    document.getElementById(`toggle-${c.id}`)?.focus()
  }

  // Course bar: earned, lost and still open, as parts of all the weight entered.
  const whole = Math.max(summary.totalWeight, 0.0001)
  const earned = Math.max(0, summary.earnedPoints)
  const lost = Math.max(0, summary.gradedWeight - summary.earnedPoints)
  const part = (n: number) => `${Math.min(100, (n / whole) * 100)}%`

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Course">
        {courses.map((c) => (
          <FilterChip
            key={c.id}
            pressed={c.id === course.id}
            onClick={() => {
              setPicked(c.id)
              setWhatIf({})
              setRemoved(null)
              setOpen(null)
            }}
          >
            <Dot color={c.color} />
            {c.code}
          </FilterChip>
        ))}
      </div>

      {/* Standing: where the student is now, and what is still open. */}
      <section aria-label="Current grade" className="rounded-2xl border border-line bg-surface shadow-card">
        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="p-5 sm:p-6">
            <p className="text-[13px] font-medium text-muted">Current standing</p>
            {summary.average === null ? (
              <>
                <div className="mt-1 text-[52px] leading-none font-light tracking-[-0.04em] text-faint">--</div>
                <p className="mt-2 text-[13px] text-muted">Enter points earned to see your standing.</p>
              </>
            ) : (
              <>
                <div className="mt-1 flex flex-wrap items-baseline gap-3">
                  <div className="text-[52px] leading-none font-light tracking-[-0.04em] tabular-nums">{summary.average.toFixed(1)}%</div>
                  {grade !== null ? <Pill className="text-xs">{grade.toFixed(1)}</Pill> : null}
                </div>
                <p className="mt-2 text-[13px] text-muted">
                  Average across graded work · {graded} of {usable.length} graded
                </p>
              </>
            )}
            {held.length ? <p className="mt-1 text-[13px] text-warn">Leaves out {heldNames} until the box marked in red is fixed.</p> : null}

            {summary.totalWeight > 0 ? (
              <>
                <div
                  className="mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full"
                  role="img"
                  // Said from the same figures as the three shown below it.
                  aria-label={`Locked in ${trim(summary.earnedPoints)} of ${trim(summary.totalWeight)} points, graded ${trim(summary.gradedWeight)} percent, remaining ${trim(summary.remainingWeight)} percent`}
                >
                  <i className="block h-full rounded-full bg-accent-fill transition-[width] duration-500 ease-(--ease-apple)" style={{ width: part(earned) }} />
                  {lost > 0.0001 ? (
                    <i className="block h-full rounded-full bg-accent-fill/30 transition-[width] duration-500 ease-(--ease-apple)" style={{ width: part(lost) }} />
                  ) : null}
                  <i className="block h-full flex-1 rounded-full bg-fill-strong" />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
                  <Stat label="Locked in" value={`${trim(summary.earnedPoints)} of ${trim(summary.totalWeight)}`} dot="var(--color-accent-fill)" />
                  <Stat label="Graded" value={`${trim(summary.gradedWeight)}%`} dot="color-mix(in srgb, var(--color-accent-fill) 30%, transparent)" />
                  <Stat label="Remaining" value={`${trim(summary.remainingWeight)}%`} dot="var(--color-fill-strong)" />
                </dl>
              </>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 border-t border-line p-5 sm:p-6 md:border-t-0 md:border-l">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
              Grade I want
              <Select className="h-11" value={String(target)} onChange={(e) => setTarget(course.id, Number(e.target.value))}>
                {TARGETS.map((g) => (
                  <option key={g} value={g}>
                    {g.toFixed(1)} ({minPercentFor(g, scale)}% and up)
                  </option>
                ))}
              </Select>
            </label>
            <div className="rounded-xl bg-fill px-4 py-3.5 text-[14px] leading-relaxed" role="status">
              {held.length ? (
                <p>
                  Fix the box marked in red for <b className="font-semibold">{heldNames}</b> to see what you need on the rest.
                </p>
              ) : need.status === 'empty' ? (
                <p className="text-muted">Add components with weights to see your grade.</p>
              ) : need.status === 'complete' ? (
                <p>
                  All components are graded. Final grade <b className="font-semibold">{need.finalPercent.toFixed(1)}%</b>, which is{' '}
                  <b className="font-semibold">{percentToGrade(need.finalPercent, scale).toFixed(1)}</b>.
                </p>
              ) : need.status === 'locked' ? (
                <p>
                  Locked in. You already have enough for <b className="font-semibold">{target.toFixed(1)}</b>.
                </p>
              ) : need.status === 'impossible' ? (
                <p>
                  Out of reach: even 100% on everything left gives <b className="font-semibold">{need.bestPossible.toFixed(1)}%</b>.
                </p>
              ) : (
                <p>
                  You need an average of <b className="font-semibold tabular-nums">{need.average.toFixed(1)}%</b> on the remaining{' '}
                  {trim(need.remainingWeight)}% of the grade.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Components" className="rounded-2xl border border-line bg-surface shadow-card p-2 sm:p-3">
          <div className="flex min-h-11 items-center justify-between gap-3 px-3 pt-2 pb-1">
            <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{course.code} components</h3>
            <Button size="sm" variant="ghost" onClick={add}>
              <Plus className="size-4" aria-hidden="true" />
              Add component
            </Button>
          </div>

          {components.length === 0 && !removed ? (
            <p className="px-3 py-4 text-muted">No components yet. Add quizzes, exams and projects with their weights.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {withRemoved(components, removed).map((c) => {
                if (c === 'removed') return <RemovedRow key="removed" removed={removed!} undoRef={undoRef} onUndo={undo} />
                const name = c.name.trim() || 'component'
                const title = c.name.trim() || 'Untitled component'
                const resultId = `result-${c.id}`
                const bad = hasError(c)
                const percent = bad ? null : scorePercent(c)
                const isOpen = open === c.id
                const points = percent === null ? null : (c.weight * percent) / 100
                const score = c.score === null ? null : `${trim(c.score)}/${trim(c.totalScore ?? DEFAULT_TOTAL)}`
                const spoken = bad
                  ? `${title}, needs a fix, worth ${trim(c.weight)}%`
                  : percent === null
                    ? `${title}, pending, worth ${trim(c.weight)}%`
                    : `${title}, ${score}, ${trim(percent)}%, adds ${trim(points!)} of ${trim(c.weight)} points`
                return (
                  <li key={c.id} className={cn('rounded-2xl transition-colors duration-200', isOpen ? 'bg-fill' : 'hover:bg-fill/70')}>
                    <button
                      type="button"
                      id={`toggle-${c.id}`}
                      aria-expanded={isOpen}
                      aria-controls={`edit-${c.id}`}
                      aria-label={spoken}
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      className="grid w-full cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-2xl px-3 py-3 text-left"
                    >
                      <StatusIcon state={bad ? 'fix' : percent === null ? 'pending' : 'done'} />
                      <span className="min-w-0">
                        <span className={cn('block truncate text-[15px] font-medium', !c.name.trim() && 'text-faint')}>{title}</span>
                        <span className="block text-xs text-muted tabular-nums">{trim(c.weight)}% of grade</span>
                      </span>
                      <span className="flex items-center gap-3 text-right">
                        <span className="flex flex-col items-end">
                          {bad ? (
                            <span className="text-[13px] font-medium text-bad">Needs a fix</span>
                          ) : percent === null ? (
                            <span className="text-[13px] text-muted">Pending</span>
                          ) : (
                            <>
                              <span className="text-[15px] font-semibold tabular-nums">{trim(percent)}%</span>
                              <span className="text-xs text-muted tabular-nums">{score}</span>
                            </>
                          )}
                        </span>
                        <span
                          className={cn(
                            'w-14 rounded-full py-1 text-center text-[13px] font-semibold tabular-nums',
                            points === null ? 'text-faint' : 'bg-accent-fill/12 text-accent',
                          )}
                        >
                          {points === null ? '—' : `+${trim(points)}`}
                        </span>
                        <ChevronDown className={cn('size-4 text-faint transition-transform duration-300', isOpen && 'rotate-180')} aria-hidden="true" />
                      </span>
                      {/* How the score went, at a glance. Pending work stays an empty track. */}
                      <span className="col-span-3 mt-2.5 block h-[3px] overflow-hidden rounded-full bg-fill-strong" aria-hidden="true">
                        <i
                          className={cn('block h-full rounded-full transition-[width] duration-500 ease-(--ease-apple)', bad ? 'bg-bad/60' : 'bg-accent-fill')}
                          style={{ width: `${percent === null ? 0 : Math.min(100, Math.max(0, percent))}%` }}
                        />
                      </span>
                    </button>

                    {isOpen ? (
                      <div id={`edit-${c.id}`} className="animate-[fade-in_180ms_ease-out] px-3 pb-4" onKeyDown={closeOnEscape(c)}>
                        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
                          Name
                          <Input
                            id={`name-${c.id}`}
                            aria-label="Component name"
                            maxLength={60}
                            placeholder="Like Quiz 1"
                            className="h-11 bg-surface text-[15px] font-medium text-ink"
                            value={c.name}
                            onChange={(e) => updateComponent(c.id, { name: e.target.value })}
                          />
                        </label>
                        <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-3">
                          <fieldset className="m-0 min-w-0 border-0 p-0">
                            <legend className="sr-only">Score for {name}</legend>
                            <div className="flex items-start gap-2">
                              <NumberField
                                id={`earned-${c.id}`}
                                label="Points earned"
                                name={name}
                                placeholder="Not yet"
                                text={textOf(c, 'score')}
                                error={errorOf(c, 'score')}
                                describedBy={resultId}
                                onText={(t) => edit(c, 'score', t)}
                                onDone={() => done(c, 'score')}
                              />
                              <span className="mt-[30px] text-lg text-faint" aria-hidden="true">
                                /
                              </span>
                              <NumberField
                                id={`total-${c.id}`}
                                label="Total possible"
                                name={name}
                                placeholder={String(DEFAULT_TOTAL)}
                                text={textOf(c, 'total')}
                                error={errorOf(c, 'total')}
                                describedBy={resultId}
                                onText={(t) => edit(c, 'total', t)}
                                onDone={() => done(c, 'total')}
                              />
                            </div>
                          </fieldset>
                          <NumberField
                            id={`weight-${c.id}`}
                            label="Weight"
                            name={name}
                            suffix="%"
                            text={textOf(c, 'weight')}
                            error={errorOf(c, 'weight')}
                            describedBy={resultId}
                            onText={(t) => edit(c, 'weight', t)}
                            onDone={() => done(c, 'weight')}
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                          <p id={resultId} className="min-w-0 flex-1 text-[13px] text-muted">
                            {bad ? (
                              'Fix the box marked in red to count this in your grade.'
                            ) : percent === null ? (
                              `Not graded yet · worth ${trim(c.weight)}% of the grade`
                            ) : (
                              <>
                                <b className="font-semibold text-ink tabular-nums">{trim(percent)}%</b>
                                {' · adds '}
                                <b className="font-semibold text-ink tabular-nums">{trim(points!)}</b>
                                {` of ${trim(c.weight)} points`}
                              </>
                            )}
                          </p>
                          <button
                            type="button"
                            id={`remove-${c.id}`}
                            aria-label={`Remove ${name}`}
                            title={`Remove ${name}`}
                            onClick={() => remove(c)}
                            className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                          >
                            <Trash2 className="size-[18px]" aria-hidden="true" />
                          </button>
                          <Button size="sm" variant="ghost" className="bg-surface" onClick={() => setOpen(null)}>
                            Done
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mx-3 mt-2 mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-line pt-3 text-[13px]">
            <span>
              Total weight <b className="font-semibold tabular-nums">{trim(enteredWeight)}%</b>
              {weightOff ? <span className="ml-2 text-warn">Weights should add up to 100%.</span> : null}
            </span>
            <span className="text-xs text-muted">Select a component to edit it. Scores are out of 100 unless you set a total.</span>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-5">
          {ungraded.length > 0 && summary.totalWeight > 0 ? (
            <section aria-label="What-if" className="rounded-2xl bg-fill p-5">
              <div className="mb-3 flex min-h-8 items-center justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em]">What if</h3>
                  <p className="text-xs text-muted">Try scores for work that is not graded yet</p>
                </div>
                {touched ? (
                  <Button size="sm" variant="subtle" onClick={() => setWhatIf({})}>
                    Reset
                  </Button>
                ) : null}
              </div>
              <ul className="flex flex-col gap-1">
                {ungraded.map((c) => {
                  const value = whatIf[c.id] ?? Math.round(summary.average ?? 75)
                  return (
                    <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4">
                      <label htmlFor={`whatif-${c.id}`} className="truncate text-sm">
                        {c.name || 'Untitled'} <span className="text-xs text-muted">({trim(c.weight)}%)</span>
                      </label>
                      <span className="text-sm font-semibold text-accent tabular-nums" aria-hidden="true">
                        {value}%
                      </span>
                      <input
                        id={`whatif-${c.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={value}
                        aria-valuetext={`${value} percent`}
                        onChange={(e) => setWhatIf((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                        className="range col-span-2 h-11 w-full"
                        style={{ ['--fill' as string]: `${value}%` }}
                      />
                    </li>
                  )
                })}
              </ul>
              {projected !== null ? (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-surface px-4 py-3.5">
                  <span className="text-[13px] text-muted">{held.length ? `Without ${heldNames}, final grade would be` : 'Final grade would be'}</span>
                  <b className="text-xl font-semibold tabular-nums">{projected.toFixed(1)}%</b>
                  <Pill>{percentToGrade(projected, scale).toFixed(1)}</Pill>
                  {touched && baseline !== null ? (
                    <span className={cn('text-[13px]', projected - baseline >= 0 ? 'text-good' : 'text-bad')}>
                      {projected - baseline >= 0 ? '+' : ''}
                      {(projected - baseline).toFixed(1)} from the current pace
                    </span>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <details className="group rounded-2xl border border-line px-5 py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg text-[15px] font-medium text-muted [&::-webkit-details-marker]:hidden">
              Grading scale
              <ChevronDown className="size-[18px] transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <p className="mt-1 mb-2.5 text-xs text-muted">A starting point. Your instructor sets the real cutoffs, so edit these to match your syllabus.</p>
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="px-2 pb-2 font-normal">Grade</th>
                  <th className="px-2 pb-2 text-right font-normal">Minimum %</th>
                </tr>
              </thead>
              <tbody>
                {TARGETS.map((g) => (
                  <tr key={g} className="border-t border-line">
                    <td className="px-2 py-1.5 font-medium">{g.toFixed(1)}</td>
                    <td className="px-2 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="any"
                        aria-label={`Minimum percent for ${g.toFixed(1)}`}
                        className="ml-auto w-24 text-right"
                        value={minPercentFor(g, scale)}
                        onChange={(e) => setScaleMin(g, parse(e.target.value) ?? 0)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button size="sm" variant="subtle" className="mt-2.5 mb-3" onClick={resetScale}>
              Reset to starting point
            </Button>
          </details>
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        <Dot color={dot} className="size-1.5" />
        {label}
      </dt>
      <dd className="m-0 mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/** Done, still pending, or waiting on a fix. Shape and color both say which. */
function StatusIcon({ state }: { state: 'done' | 'pending' | 'fix' }) {
  if (state === 'done') {
    return (
      <span className="grid size-6 place-items-center rounded-full bg-accent-fill text-on-accent" aria-hidden="true">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    )
  }
  if (state === 'fix') {
    return (
      <span className="grid size-6 place-items-center text-bad" aria-hidden="true">
        <AlertCircle className="size-5" />
      </span>
    )
  }
  return <span className="size-6 rounded-full border-[1.5px] border-dashed border-faint/70" aria-hidden="true" />
}

/** The course's components, with the one just removed shown back in its place. */
function withRemoved(list: GradeComponent[], removed: (RemovedComponent & { at: number }) | null): (GradeComponent | 'removed')[] {
  if (!removed) return list
  const out: (GradeComponent | 'removed')[] = [...list]
  out.splice(Math.min(Math.max(removed.at, 0), out.length), 0, 'removed')
  return out
}

/** Where a removed component was: what it held, and one button to bring all of it back. */
function RemovedRow({
  removed,
  undoRef,
  onUndo,
}: {
  removed: RemovedComponent
  undoRef: React.RefObject<HTMLButtonElement | null>
  onUndo: () => void
}) {
  const c = removed.component
  const name = c.name.trim() || 'Component'
  const score = c.score === null ? 'not graded' : `${c.score}/${c.totalScore ?? DEFAULT_TOTAL}`
  return (
    <li className="flex animate-[fade-in_180ms_ease-out] items-center gap-3 rounded-2xl border border-dashed border-line-strong px-3 py-2">
      <p role="status" className="min-w-0 flex-1 text-[13px] text-muted">
        <span className="text-ink">Removed {name}</span> · {score} · {trim(c.weight)}%
      </p>
      <Button ref={undoRef} size="lg" variant="ghost" className="h-11" onClick={onUndo}>
        Undo
      </Button>
    </li>
  )
}
