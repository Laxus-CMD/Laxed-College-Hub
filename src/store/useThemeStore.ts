import { useEffect, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from '@/lib/storage'
import {
  DEFAULT_FAMILY,
  DEFAULT_MODE,
  isFamily,
  isModePreference,
  themeId,
  type Mode,
  type ModePreference,
  type ThemeFamily,
} from '@/lib/themes'

/** Must match the key read by the inline scripts in index.html, privacy.html and terms.html. */
export const THEME_STORAGE_KEY = 'college-hub.theme'

interface ThemeState {
  family: ThemeFamily
  setFamily: (family: ThemeFamily) => void
  /** Light, dark or follow the device. Saved as `theme` since before there were theme families. */
  theme: ModePreference
  setTheme: (theme: ModePreference) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      family: DEFAULT_FAMILY,
      setFamily: (family) => set({ family }),
      theme: DEFAULT_MODE,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ family: s.family, theme: s.theme }),
      // Anything missing or unknown becomes the default.
      merge: (saved, current) => {
        const { family, theme } = (saved ?? {}) as Partial<Record<'family' | 'theme', unknown>>
        return {
          ...current,
          family: isFamily(family) ? family : DEFAULT_FAMILY,
          theme: isModePreference(theme) ? theme : DEFAULT_MODE,
        }
      },
    },
  ),
)

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
}

function subscribeSystem(onChange: () => void): () => void {
  const mq = systemQuery()
  mq?.addEventListener('change', onChange)
  return () => mq?.removeEventListener('change', onChange)
}

const systemIsDark = () => systemQuery()?.matches ?? false

/** Light or dark, whichever is actually showing. */
export function useResolvedMode(): Mode {
  const pref = useThemeStore((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false)
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

let switchTimer: ReturnType<typeof setTimeout> | undefined

/** Writes the theme onto <html>. Mount once, near the root. */
export function useApplyTheme(): void {
  const family = useThemeStore((s) => s.family)
  const mode = useResolvedMode()
  useEffect(() => {
    const root = document.documentElement
    const id = themeId(family, mode)
    if (root.dataset.theme === id) return
    // Only crossfade on a real switch, not on the first paint.
    if (root.dataset.theme) {
      root.classList.add('theme-switching')
      clearTimeout(switchTimer)
      switchTimer = setTimeout(() => root.classList.remove('theme-switching'), 260)
    }
    root.dataset.theme = id
    const page = getComputedStyle(root).getPropertyValue('--bg-page').trim()
    if (page) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', page)
  }, [family, mode])
}
