import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GoogleUser } from '@/features/auth/google'
import { persistStorage } from '@/lib/storage'

interface AuthState {
  /** The signed-in Google account, or null. */
  user: GoogleUser | null
  /** True when the student chose to use the app without signing in. */
  guest: boolean
  signIn: (user: GoogleUser) => void
  continueAsGuest: () => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      guest: false,
      signIn: (user) => set({ user, guest: false }),
      continueAsGuest: () => set({ user: null, guest: true }),
      signOut: () => {
        // Stop Google from silently signing the same account back in.
        window.google?.accounts?.id?.disableAutoSelect()
        set({ user: null, guest: false })
      },
    }),
    {
      name: 'college-hub.auth',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ user: s.user, guest: s.guest }),
    },
  ),
)

export const useIsSignedIn = () => useAuthStore((s) => s.user !== null || s.guest)
