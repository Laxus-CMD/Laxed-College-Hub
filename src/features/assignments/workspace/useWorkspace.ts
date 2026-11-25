import { useMemo } from 'react'
import type { Course, Task } from '@/types'
import { useNow } from '@/lib/useNow'
import { useCourseMap } from '@/store/selectors'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

export interface Workspace {
  now: Date
  /** Every task, before the course filter. */
  all: Task[]
  /** The tasks the modes work on: all of them, or one course's. */
  tasks: Task[]
  courses: Course[]
  courseOf: (task: Task) => Course | undefined
  /** The course filter. Empty means every course. Shared with the sidebar and search. */
  courseId: string
  setCourseId: (id: string) => void
}

/**
 * What every mode works from. Tasks come straight from the one task store, so a change made
 * in any mode, on the Schedule calendar or on a dashboard widget shows everywhere at once.
 */
export function useWorkspace(): Workspace {
  const now = useNow()
  const all = useTaskStore((s) => s.tasks)
  const courses = useScheduleStore((s) => s.courses)
  const courseMap = useCourseMap()
  const chosen = useUiStore((s) => s.taskCourse)
  const setCourseId = useUiStore((s) => s.setTaskCourse)
  // A course deleted (here or on another device) stops filtering, rather than hiding everything.
  const courseId = courses.some((c) => c.id === chosen) ? chosen : ''
  const tasks = useMemo(() => (courseId ? all.filter((t) => t.courseId === courseId) : all), [all, courseId])
  return { now, all, tasks, courses, courseOf: (t) => courseMap.get(t.courseId ?? ''), courseId, setCourseId }
}

