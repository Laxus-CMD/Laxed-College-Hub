import { useMemo } from 'react'
import type { Course, GradeComponent } from '@/types'
import { useGradeStore } from '@/store/useGradeStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { percentToGrade, summarize, termGpa, type ComponentSummary } from '@/features/grades/gradeMath'

export interface CourseGrade {
  course: Course
  components: GradeComponent[]
  summary: ComponentSummary
  /** Grade point from the scores, or null before anything is graded. */
  auto: number | null
  /** A grade point picked by hand, if any. */
  override: number | null
  /** The grade point that counts: the override, else the one from the scores. */
  grade: number | null
}

export function useCourseGrades(): CourseGrade[] {
  const courses = useScheduleStore((s) => s.courses)
  const components = useGradeStore((s) => s.components)
  const scale = useGradeStore((s) => s.scale)
  const overrides = useGradeStore((s) => s.overrides)
  return useMemo(
    () =>
      courses.map((course) => {
        const comps = components.filter((c) => c.courseId === course.id)
        const summary = summarize(comps)
        const auto = summary.average === null ? null : percentToGrade(summary.average, scale)
        const override = overrides[course.id] ?? null
        return { course, components: comps, summary, auto, override, grade: override ?? auto }
      }),
    [courses, components, scale, overrides],
  )
}

export function useTermGpa() {
  const rows = useCourseGrades()
  return useMemo(() => {
    const t = termGpa(rows.map((r) => ({ units: r.course.units, grade: r.grade })))
    const allUnits = rows.reduce((sum, r) => sum + r.course.units, 0)
    return { ...t, allUnits, graded: rows.filter((r) => r.grade !== null && r.course.units > 0).length, rows }
  }, [rows])
}
