import type { Task } from '@/types'

/** What the student picks: an exam is an assignment with the exam category. */
export type TaskType = 'assignment' | 'exam' | 'todo'

export const TASK_TYPES: { id: TaskType; label: string }[] = [
  { id: 'assignment', label: 'Assignment' },
  { id: 'exam', label: 'Exam' },
  { id: 'todo', label: 'To-do' },
]

export const typeOf = (t: Pick<Task, 'kind' | 'category'>): TaskType => (t.kind === 'todo' ? 'todo' : t.category === 'exam' ? 'exam' : 'assignment')

/** The stored fields for a type. A to-do is never an exam and counts for no grade. */
export const fieldsOf = (type: TaskType): Pick<Task, 'kind' | 'category' | 'weight'> =>
  type === 'todo'
    ? { kind: 'todo', category: null, weight: undefined }
    : { kind: 'assignment', category: type === 'exam' ? 'exam' : null }

export const typeLabel = (t: Pick<Task, 'kind' | 'category'>) => TASK_TYPES.find((x) => x.id === typeOf(t))!.label
