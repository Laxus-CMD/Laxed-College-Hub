import { useMemo } from 'react'
import type { Course } from '@/types'
import { useScheduleStore } from '@/store/useScheduleStore'

/** Courses keyed by id, for quick lookups while rendering lists. */
export function useCourseMap(): Map<string, Course> {
  const courses = useScheduleStore((s) => s.courses)
  return useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses])
}
