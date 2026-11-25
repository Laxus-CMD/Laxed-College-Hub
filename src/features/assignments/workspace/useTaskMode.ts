import type { TaskMode } from '@/types'
import { useSettingsStore } from '@/store/useSettingsStore'
import { modeOf } from './modes'

/** The mode to show: the one last chosen, if this version has it. */
export function useTaskMode(): [TaskMode, (mode: TaskMode) => void] {
  const saved = useSettingsStore((s) => s.taskMode)
  const set = useSettingsStore((s) => s.setTaskMode)
  return [modeOf(saved).id, set]
}
