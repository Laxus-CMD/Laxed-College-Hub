import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from '@/lib/storage'

interface SettingsState {
  name: string
  /** True while the sample data is loaded. Drives the banner on Overview. */
  isDemo: boolean
  bannerDismissed: boolean
  setName: (name: string) => void
  setDemo: (isDemo: boolean) => void
  dismissBanner: () => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      name: '',
      isDemo: true,
      bannerDismissed: false,
      setName: (name) => set({ name }),
      setDemo: (isDemo) => set({ isDemo, bannerDismissed: false }),
      dismissBanner: () => set({ bannerDismissed: true }),
    }),
    {
      name: 'college-hub.settings',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ name: s.name, isDemo: s.isDemo, bannerDismissed: s.bannerDismissed }),
    },
  ),
)
