import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Dot, Pill } from '@/components/ui/Chip'
import { Input, Label, Select } from '@/components/ui/Field'
import { FilterChip } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import {
  GRADE_POINTS,
  minPercentFor,
  neededAverage,
  percentToGrade,
  projectFinal,
  summarize,
} from '@/features/grades/gradeMath'
import { useGradeStore } from '@/store/useGradeStore'
import { useScheduleStore } from '@/store/useScheduleStore'

const trim = (n: number) => String(Number(n.toFixed(1)))
const parse = (v: string): number | null => (v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const TARGETS = GRADE_POINTS.filter((g) => g > 0)

export function CourseGradesTab() {
  const courses = useScheduleStore((s) => s.courses)
  const allComponents = useGradeStore((s) => s.components)
  const scale = useGradeStore((s) => s.scale)
  const targets = useGradeStore((s) => s.targets)
  const addComponent = useGradeStore((s) => s.addComponent)
  const updateComponent = useGradeStore((s) => s.updateComponent)
  const removeComponent = useGradeStore((s) => s.removeComponent)
  const setTarget = useGradeStore((s) => s.setTarget)
  const setScaleMin = useGradeStore((s) => s.setScaleMin)
  const resetScale = useGradeStore((s) => s.resetScale)

  const [picked, setPicked] = useState<string>('')
  const [whatIf, setWhatIf] = useState<Record<string, number>>({})
  const course = courses.find((c) => c.id === picked) ?? courses[0]

  const components = useMemo(
    () => allComponents.filter((c) => c.courseId === course?.id),
    [allComponents, course?.id],
  )
  const summary = useMemo(() => summarize(components), [components])
  const target = (course && targets[course.id]) ?? 3
  const need = neededAverage(components, minPercentFor(target, scale))
  const grade = summary.average === null ? null : percentToGrade(summary.average, scale)
  const ungraded = components.filter((c) => c.score === null)

  const projected = projectFinal(components, whatIf)
  const baseline = projectFinal(components)
  const touched = ungraded.some((c) => whatIf[c.id] !== undefined)

  if (!course) return null
  const weightOff = Math.abs(summary.totalWeight - 100) > 0.05

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
            }}
          >
            <Dot color={c.color} />
            {c.code}
          </FilterChip>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader
              title={`${course.code} components`}
              actions={
                <Button size="sm" onClick={() => addComponent(course.id)}>
                  <Plus className="size-4" aria-hidden="true" />
                  Add component
                </Button>
              }
            />
            {components.length === 0 ? (
              <p className="py-1.5 text-muted">No components yet. Add quizzes, exams and projects with their weights.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      <th className="px-2 pb-2.5 font-normal">Name</th>
                      <th className="px-2 pb-2.5 text-right font-normal">Weight %</th>
                      <th className="px-2 pb-2.5 text-right font-normal">Score %</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {components.map((c) => (
                      <tr key={c.id} className="border-t border-line">
                        <td className="px-2 py-1.5">
                          <Input
                            aria-label="Component name"
                            maxLength={60}
                            value={c.name}
                            onChange={(e) => updateComponent(c.id, { name: e.target.value })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            aria-label={`Weight for ${c.name || 'component'}`}
                            className="ml-auto w-24 text-right"
                            value={c.weight}
                            onChange={(e) => updateComponent(c.id, { weight: parse(e.target.value) ?? 0 })}
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={150}
                            step="any"
                            placeholder="Not yet"
                            aria-label={`Score for ${c.name || 'component'}`}
                            className="ml-auto w-24 text-right"
                            value={c.score ?? ''}
                            onChange={(e) => updateComponent(c.id, { score: parse(e.target.value) })}
                          />
                        </td>
                        <td className="px-1 py-1.5">
                          <IconButton label={`Remove ${c.name || 'component'}`} onClick={() => removeComponent(c.id)}>
                            <X className="size-4" aria-hidden="true" />
                          </IconButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3">
              Total weight <b className="font-semibold tabular-nums">{trim(summary.totalWeight)}%</b>
              {weightOff ? <span className="ml-2 text-[13px] text-warn">Weights should add up to 100%.</span> : null}
            </p>
            <p className="mt-1.5 text-xs text-muted">Leave a score empty until it is graded.</p>
          </Card>

          {ungraded.length > 0 && summary.totalWeight > 0 ? (
            <Card aria-label="What-if">
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
                      <output htmlFor={`whatif-${c.id}`} className="text-sm font-medium tabular-nums">
                        {value}%
                      </output>
                      <input
                        id={`whatif-${c.id}`}
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={value}
                        onChange={(e) => setWhatIf((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
                        className="col-span-2 w-full accent-accent-fill"
                      />
                    </li>
                  )
                })}
              </ul>
              {projected !== null ? (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[14px] bg-canvas px-4 py-3.5" role="status">
                  <span className="text-muted">Final grade would be</span>
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
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card aria-label="Current grade">
            <CardHeader title="Current grade" />
            {summary.average === null ? (
              <>
                <div className="text-[46px] leading-none font-medium text-faint">--</div>
                <p className="mt-2 text-muted">Enter a score to see your current grade.</p>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-3">
                  <div className="text-[46px] leading-none font-medium tracking-tight tabular-nums">{summary.average.toFixed(1)}%</div>
                  {grade !== null ? <Pill>{grade.toFixed(1)}</Pill> : null}
                </div>
                <p className="mt-2 text-muted">Average across graded work</p>
              </>
            )}
            {summary.totalWeight > 0 ? (
              <>
                <div
                  className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/8"
                  role="img"
                  aria-label={`Locked in ${summary.lockedPercent.toFixed(0)} percent, remaining ${(100 - summary.lockedPercent).toFixed(0)} percent`}
                >
                  <i className="block h-full bg-accent" style={{ width: `${summary.lockedPercent}%` }} />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Dot color="var(--color-accent)" />
                    Locked in {trim(summary.earnedPoints)} of {trim(summary.totalWeight)}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Dot color="rgb(255 255 255 / 0.2)" />
                    Remaining {trim(summary.remainingWeight)}
                  </span>
                </div>
              </>
            ) : null}
            <div className="mt-3.5 rounded-[14px] bg-canvas px-4 py-3.5" role="status">
              {need.status === 'empty' ? (
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
              <Select value={String(target)} onChange={(e) => setTarget(course.id, Number(e.target.value))}>
                {TARGETS.map((g) => (
                  <option key={g} value={g}>
                    {g.toFixed(1)} ({minPercentFor(g, scale)}% and up)
                  </option>
                ))}
              </Select>
            </Label>
          </Card>

          <Card>
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium [&::-webkit-details-marker]:hidden">
                Grading scale
                <Plus className="size-[18px] text-muted" aria-hidden="true" />
              </summary>
              <p className="mt-3 mb-2.5 text-xs text-muted">
                A starting point. Your instructor sets the real cutoffs, so edit these to match your syllabus.
              </p>
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
              <Button size="sm" variant="subtle" className="mt-2.5" onClick={resetScale}>
                Reset to starting point
              </Button>
            </details>
          </Card>
        </div>
      </div>
    </>
  )
}
