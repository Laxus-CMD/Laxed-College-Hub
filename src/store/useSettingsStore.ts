import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { studentStorage } from '@/lib/storage'
import type { TaskMode } from '@/types'

interface SettingsState {
  name: string
  /** True while the sample data is loaded. Drives the banner on Overview. */
  isDemo: boolean
  bannerDismissed: boolean
  /** The Tasks workspace mode last chosen. Null until chosen: Classic. Follows the account. */
  taskMode: TaskMode | null
  setName: (name: string) => void
  setDemo: (isDemo: boolean) => void
  dismissBanner: () => void
  setTaskMode: (mode: TaskMode) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      name: '',
      isDemo: true,
      bannerDismissed: false,
      taskMode: null,
      setName: (name) => set({ name }),
      setDemo: (isDemo) => set({ isDemo, bannerDismissed: false }),
      dismissBanner: () => set({ bannerDismissed: true }),
      setTaskMode: (taskMode) => set({ taskMode }),
    }),
    {
      name: 'college-hub.settings',
      version: 1,
      storage: studentStorage,
      partialize: (s) => ({ name: s.name, isDemo: s.isDemo, bannerDismissed: s.bannerDismissed, taskMode: s.taskMode }),
    },
  ),
)
