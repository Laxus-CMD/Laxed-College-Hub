import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Dot, Pill } from '@/components/ui/Chip'
import { Input, Label, Select } from '@/components/ui/Field'
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
          className={cn('h-11 w-full text-right tabular-nums aria-invalid:border-bad aria-invalid:focus:border-bad aria-invalid:focus:ring-bad/15', suffix ? 'pr-7' : undefined)}
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
  const undoRef = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<string | null>(null)
  const course = courses.find((c) => c.id === picked) ?? courses[0]

  // Keyboard focus follows the action: to Undo after a removal, and back to the row after Undo.
  useEffect(() => {
    if (removed) undoRef.current?.focus()
    else if (returnTo.current) {
      document.getElementById(`remove-${returnTo.current}`)?.focus()
      returnTo.current = null
    }
  }, [removed])

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

  const remove = (c: GradeComponent) => {
    const at = components.findIndex((x) => x.id === c.id)
    const r = deleteComponent(c.id)
    if (r) setRemoved({ ...r, at })
  }
  const undo = () => {
    if (!removed) return
    restoreComponent(removed)
    returnTo.current = removed.component.id
    setRemoved(null)
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
            }}
          >
            <Dot color={c.color} />
            {c.code}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* The current grade comes first on a phone, and stays in view beside the list on a wide screen. */}
        <div className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-6 xl:order-2">
          <Card aria-label="Current grade">
            <CardHeader title="Current grade" />
            {summary.average === null ? (
              <>
                <div className="text-[46px] leading-none font-medium text-faint">--</div>
                <p className="mt-2 text-muted">Enter points earned to see your current grade.</p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-3">
                  <div className="text-[48px] leading-none font-semibold tracking-[-0.04em] tabular-nums">{summary.average.toFixed(1)}%</div>
                  {grade !== null ? <Pill>{grade.toFixed(1)}</Pill> : null}
                </div>
                <p className="mt-2 text-muted">Average across graded work</p>
                {held.length ? <p className="mt-1 text-[13px] text-warn">Leaves out {heldNames} until the box marked in red is fixed.</p> : null}
              </>
            )}
            {summary.totalWeight > 0 ? (
              <>
                <div
                  className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-fill-strong"
                  role="img"
                  aria-label={`Locked in ${summary.lockedPercent.toFixed(0)} percent, remaining ${(100 - summary.lockedPercent).toFixed(0)} percent`}
                >
                  <i className="block h-full rounded-full bg-accent-fill" style={{ width: `${summary.lockedPercent}%` }} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Dot color="var(--color-accent-fill)" />
                    Locked in {trim(summary.earnedPoints)} of {trim(summary.totalWeight)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Dot color="var(--color-line-strong)" />
                    Remaining {trim(summary.remainingWeight)}
                  </span>
                </div>
              </>
            ) : null}
            <div className="mt-3.5 rounded-xl bg-fill px-4 py-3.5" role="status">
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
            <div className="my-[18px] h-px bg-line" />
            <Label label="Grade I want">
              <Select className="h-11" value={String(target)} onChange={(e) => setTarget(course.id, Number(e.target.value))}>
                {TARGETS.map((g) => (
                  <option key={g} value={g}>
                    {g.toFixed(1)} ({minPercentFor(g, scale)}% and up)
                  </option>
                ))}
              </Select>
            </Label>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5 xl:order-1">
          <Card aria-label="Components">
            <CardHeader
              title={`${course.code} components`}
              actions={
                <Button size="sm" onClick={() => addComponent(course.id)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add component
                </Button>
              }
            />
            {components.length === 0 && !removed ? (
              <p className="py-1.5 text-muted">No components yet. Add quizzes, exams and projects with their weights.</p>
            ) : (
              <ul className="flex flex-col">
                {withRemoved(components, removed).map((c) => {
                  if (c === 'removed') return <RemovedRow key="removed" removed={removed!} undoRef={undoRef} onUndo={undo} />
                  const name = c.name.trim() || 'component'
                  const resultId = `result-${c.id}`
                  const percent = hasError(c) ? null : scorePercent(c)
                  return (
                    <li key={c.id} className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-1">
                      <div className="flex items-center gap-3">
                        <Input
                          aria-label="Component name"
                          maxLength={60}
                          placeholder="Name, like Quiz 1"
                          className="h-11 min-w-0 flex-1 font-medium"
                          value={c.name}
                          onChange={(e) => updateComponent(c.id, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          id={`remove-${c.id}`}
                          aria-label={`Remove ${name}`}
                          title={`Remove ${name}`}
                          onClick={() => remove(c)}
                          className="ml-1 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-bad/10 hover:text-bad"
                        >
                          <X className="size-[18px]" aria-hidden="true" />
                        </button>
                      </div>

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
                        <span className="mt-6 hidden h-11 w-px bg-line sm:block" aria-hidden="true" />
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

                      <p id={resultId} className="mt-2.5 text-[13px] text-muted">
                        {hasError(c) ? (
                          'Fix the box marked in red to count this in your grade.'
                        ) : percent === null ? (
                          `Not graded yet · worth ${trim(c.weight)}% of the grade`
                        ) : (
                          <>
                            <b className="font-semibold text-ink tabular-nums">{trim(percent)}%</b>
                            {' · adds '}
                            <b className="font-semibold text-ink tabular-nums">{trim((c.weight * percent) / 100)}</b>
                            {` of ${trim(c.weight)} points`}
                          </>
                        )}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="mt-3 border-t border-line pt-3">
              <p>
                Total weight <b className="font-semibold tabular-nums">{trim(enteredWeight)}%</b>
                {weightOff ? <span className="ml-2 text-[13px] text-warn">Weights should add up to 100%.</span> : null}
              </p>
              <p className="mt-1.5 text-xs text-muted">
                Enter scores the way you get them back, like 42 out of 50. Total possible is 100 unless you change it. Leave points earned empty until
                the work is graded. A 0 counts as graded.
              </p>
            </div>
          </Card>

          {ungraded.length > 0 && summary.totalWeight > 0 ? (
            <section aria-label="What-if" className="rounded-2xl bg-fill p-5 sm:p-6">
              <CardHeader
                title="What if"
                meta="Try scores for work that is not graded yet"
                actions={
                  touched ? (
                    <Button size="sm" variant="subtle" onClick={() => setWhatIf({})}>
                      Reset
                    </Button>
                  ) : undefined
                }
              />
              <ul className="flex flex-col gap-3.5">
                {ungraded.map((c) => {
                  const value = whatIf[c.id] ?? Math.round(summary.average ?? 75)
                  return (
                    <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                      <label htmlFor={`whatif-${c.id}`} className="truncate text-sm">
                        {c.name || 'Untitled'} <span className="text-xs text-muted">({trim(c.weight)}%)</span>
                      </label>
                      <span className="text-sm font-medium tabular-nums" aria-hidden="true">
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
                        className="col-span-2 h-6 w-full accent-accent-fill"
                      />
                    </li>
                  )
                })}
              </ul>
              {projected !== null ? (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl bg-surface px-4 py-3.5">
                  <span className="text-muted">{held.length ? `Without ${heldNames}, final grade would be` : 'Final grade would be'}</span>
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

          <details className="group rounded-2xl border border-line px-5 py-1 sm:px-6">
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
    <li className="flex items-center gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <p role="status" className="min-w-0 flex-1 text-[13px] text-muted">
        <span className="text-ink">Removed {name}</span> · {score} · {trim(c.weight)}%
      </p>
      <Button ref={undoRef} size="lg" variant="ghost" onClick={onUndo}>
        Undo
      </Button>
    </li>
  )
}
