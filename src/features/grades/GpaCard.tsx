import { Card, CardHeader } from '@/components/ui/Card'
import { CourseChip } from '@/components/ui/Chip'
import { navigate } from '@/lib/route'
import { plural } from '@/lib/time'
import { useTermGpa } from '@/features/grades/useCourseGrades'

const trim = (n: number) => String(Number(n.toFixed(1)))

/** Term GPA snapshot for Overview. */
export function GpaCard() {
  const term = useTermGpa()
  return (
    <Card aria-label="Term GPA">
      <CardHeader
        title="Term GPA"
        actions={
          <button type="button" onClick={() => navigate('grades')} className="cursor-pointer text-[13px] text-accent hover:underline">
            Open calculator
          </button>
        }
      />
      {term.gpa === null ? (
        <>
          <div className="text-[46px] leading-none font-medium text-faint">--</div>
          <p className="mt-2 text-muted">Add scores or grades to see your term GPA.</p>
        </>
      ) : (
        <>
          <div className="text-[46px] leading-none font-medium tracking-tight tabular-nums">{term.gpa.toFixed(2)}</div>
          <p className="mt-2 text-muted">
            {plural(term.graded, 'course')}, {trim(term.units)} units counted
          </p>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {term.rows
              .filter((r) => r.grade !== null)
              .map((r) => (
                <CourseChip key={r.course.id} course={r.course}>
                  <b className="font-medium">{r.grade?.toFixed(1)}</b>
                </CourseChip>
              ))}
          </div>
        </>
      )}
    </Card>
  )
}
