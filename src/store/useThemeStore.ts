import { useEffect, useSyncExternalStore } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { persistStorage } from '@/lib/storage'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

/** Must match the key read by the inline script in index.html. */
export const THEME_STORAGE_KEY = 'college-hub.theme'

interface ThemeState {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: THEME_STORAGE_KEY,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ theme: s.theme }),
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

export function resolveTheme(pref: ThemePreference, systemDark: boolean): Theme {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
}

/** The theme actually showing, following the OS when the preference is "system". */
export function useResolvedTheme(): Theme {
  const pref = useThemeStore((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribeSystem, systemIsDark, () => false)
  return resolveTheme(pref, systemDark)
}

let switchTimer: ReturnType<typeof setTimeout> | undefined

/** Writes the resolved theme onto <html>. Mount once, near the root. */
export function useApplyTheme(): Theme {
  const theme = useResolvedTheme()
  useEffect(() => {
    const root = document.documentElement
    if (root.dataset.theme === theme) return
    // Only crossfade on a real switch, not on the first paint.
    if (root.dataset.theme) {
      root.classList.add('theme-switching')
      clearTimeout(switchTimer)
      switchTimer = setTimeout(() => root.classList.remove('theme-switching'), 260)
    }
    root.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f5f7')
  }, [theme])
  return theme
}
