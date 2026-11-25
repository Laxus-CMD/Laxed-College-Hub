import type { Task } from '@/types'

/** Where a task is in Flow. Worked out from `done` and `progress`; never stored on its own. */
export type Stage = 'not-started' | 'in-progress' | 'completed'

export const STAGES: { id: Stage; label: string }[] = [
  { id: 'not-started', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'completed', label: 'Completed' },
]

export const stageLabel = (s: Stage) => STAGES.find((x) => x.id === s)!.label

export const stageOf = (t: Pick<Task, 'done' | 'progress'>): Stage => (t.done ? 'completed' : t.progress === 'started' ? 'in-progress' : 'not-started')

/**
 * The fields that put a task in a stage. Completing keeps `progress`, so a task reopened later
 * (here, in Classic or in an older app) goes back to In progress if it was started.
 */
export function fieldsForStage(stage: Stage): Pick<Task, 'done'> & Partial<Pick<Task, 'progress'>> {
  if (stage === 'completed') return { done: true }
  return { done: false, progress: stage === 'in-progress' ? 'started' : null }
}
