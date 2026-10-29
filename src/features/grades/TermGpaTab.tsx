import { useMemo, useState } from 'react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input, Label, Select } from '@/components/ui/Field'
import { Dot } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { GRADE_POINTS, projectCgpa, requiredTermGpa } from '@/features/grades/gradeMath'
import { useTermGpa } from '@/features/grades/useCourseGrades'
import { useGradeStore } from '@/store/useGradeStore'
import { useScheduleStore } from '@/store/useScheduleStore'

const trim = (n: number) => String(Number(n.toFixed(1)))
const parse = (v: string): number | null => (v === '' || Number.isNaN(Number(v)) ? null : Number(v))

function Result({ children }: { children: React.ReactNode }) {
  return <div className="mt-3.5 rounded-[14px] bg-canvas px-4 py-3.5">{children}</div>
}

export function TermGpaTab() {
  const term = useTermGpa()
  const updateCourse = useScheduleStore((s) => s.updateCourse)
  const setOverride = useGradeStore((s) => s.setOverride)
  const prior = useGradeStore((s) => s.prior)
  const setPrior = useGradeStore((s) => s.setPrior)
  const [target, setTarget] = useState('')

  const cum = useMemo(
    () =>
      prior.cgpa !== null && prior.units !== null && term.units > 0
        ? projectCgpa(prior.cgpa, prior.units, term)
        : null,
    [prior, term],
  )
  const targetValue = parse(target)
  const need =
    targetValue !== null && prior.cgpa !== null && prior.units !== null
      ? requiredTermGpa(targetValue, prior.cgpa, prior.units, term.allUnits)
      : null

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="This term" meta={`${trim(term.allUnits)} units total`} />
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="px-2 pb-2.5 font-normal">Course</th>
                <th className="px-2 pb-2.5 text-right font-normal">Units</th>
                <th className="px-2 pb-2.5 text-right font-normal">Grade</th>
              </tr>
            </thead>
            <tbody>
              {term.rows.map((r) => (
                <tr key={r.course.id} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Dot color={r.course.color} />
                      <b className="font-medium">{r.course.code}</b>
                      <span className="truncate text-xs text-muted max-sm:hidden">{r.course.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Input
                      type="number"
                      min={0}
                      max={12}
                      step={0.5}
                      aria-label={`Units for ${r.course.code}`}
                      className="ml-auto w-20 text-right"
                      value={r.course.units}
                      onChange={(e) => updateCourse(r.course.id, { units: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Select
                      aria-label={`Grade for ${r.course.code}`}
                      className="ml-auto w-32"
                      value={r.override === null ? '' : String(r.override)}
                      onChange={(e) => setOverride(r.course.id, e.target.value === '' ? null : Number(e.target.value))}
                    >
                      <option value="">Auto: {r.auto === null ? 'no scores' : r.auto.toFixed(1)}</option>
                      {GRADE_POINTS.map((g) => (
                        <option key={g} value={g}>
                          {g.toFixed(1)}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Auto uses your scores from Course grades and the grading scale. Pick a grade to override it. Courses without a grade
          stay out of the GPA.
        </p>
      </Card>

      <div className="flex min-w-0 flex-col gap-5">
        <Card aria-label="Term GPA result">
          <CardHeader title="Term GPA" />
          {term.gpa === null ? (
            <>
              <div className="text-[46px] leading-none font-medium text-faint">--</div>
              <p className="mt-2 text-muted">Pick a grade or enter scores in Course grades.</p>
            </>
          ) : (
            <>
              <div className="text-[46px] leading-none font-medium tracking-tight tabular-nums">{term.gpa.toFixed(2)}</div>
              <p className="mt-2 text-muted">
                {term.graded} {term.graded === 1 ? 'course' : 'courses'}, {trim(term.units)} units counted
              </p>
            </>
          )}
        </Card>

        <Card aria-label="Cumulative GPA">
          <CardHeader title="Cumulative GPA" />
          <div className="grid grid-cols-2 gap-3">
            <Label label="Previous CGPA">
              <Input
                type="number"
                min={0}
                max={4}
                step={0.01}
                placeholder="3.40"
                value={prior.cgpa ?? ''}
                onChange={(e) => setPrior({ cgpa: parse(e.target.value) })}
              />
            </Label>
            <Label label="Previous units">
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="36"
                value={prior.units ?? ''}
                onChange={(e) => setPrior({ units: parse(e.target.value) })}
              />
            </Label>
          </div>
          <Result>
            {cum !== null && prior.cgpa !== null ? (
              <p>
                New CGPA <b className="font-semibold tabular-nums">{cum.toFixed(2)}</b>{' '}
                <span className={cn('text-[13px] font-medium', cum - prior.cgpa >= 0 ? 'text-good' : 'text-bad')}>
                  {cum - prior.cgpa >= 0 ? '+' : ''}
                  {(cum - prior.cgpa).toFixed(2)}
                </span>
              </p>
            ) : (
              <p className="text-muted">Enter your previous CGPA and units to see where you land.</p>
            )}
          </Result>

          <div className="my-[18px] h-px bg-line" />

          <Label label="Target CGPA">
            <Input
              type="number"
              min={0}
              max={4}
              step={0.01}
              placeholder="3.50"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </Label>
          <Result>
            {targetValue === null ? (
              <p className="text-muted">Enter a target CGPA to see the term GPA you need.</p>
            ) : need === null ? (
              <p className="text-muted">Add your previous CGPA and units first, and give your courses units.</p>
            ) : need > 4 ? (
              <p>
                Out of reach this term. You would need a <b className="font-semibold">{need.toFixed(2)}</b> term GPA, and the top
                grade is 4.00.
              </p>
            ) : need <= 0 ? (
              <p>Already covered. Any term GPA keeps you at or above {targetValue.toFixed(2)}.</p>
            ) : (
              <p>
                Aim for a term GPA of <b className="font-semibold tabular-nums">{need.toFixed(2)}</b> across {trim(term.allUnits)}{' '}
                units.
              </p>
            )}
          </Result>
        </Card>
      </div>
    </div>
  )
}
