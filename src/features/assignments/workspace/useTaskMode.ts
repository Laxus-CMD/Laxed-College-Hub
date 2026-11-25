import { canStore, useSyncStore } from '@/sync/useSyncStore'
import type { TaskMode } from '@/types'
import { useSettingsStore } from '@/store/useSettingsStore'
import { MODES, modeOf, type ModeDef } from './modes'

/**
 * The modes this account can use, the one to show, and how to choose another. A mode whose
 * data the account's API cannot keep is not offered, and neither is choosing at all while the
 * API cannot keep the choice.
 */
export function useTaskMode(): { modes: ModeDef[]; mode: TaskMode; setMode: (mode: TaskMode) => void; canChoose: boolean } {
  const saved = useSettingsStore((s) => s.taskMode)
  const setMode = useSettingsStore((s) => s.setTaskMode)
  const accountId = useSyncStore((s) => s.accountId)
  const features = useSyncStore((s) => s.features)
  const api = { accountId, features }
  const modes = MODES.filter((m) => !m.needs || canStore(api, m.needs))
  const canChoose = modes.length > 1 && canStore(api, 'taskMode')
  return { modes, mode: modeOf(saved, modes).id, setMode, canChoose }
}
