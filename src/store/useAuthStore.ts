import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { accountsApi, type Account } from '@/features/auth/api'
import type { GoogleUser } from '@/features/auth/google'
import { persistStorage } from '@/lib/storage'

interface AuthState {
  /** The signed-in Google account, or null. */
  user: GoogleUser | null
  /**
   * The signed-in College Hub account (email and password), or null. This copy
   * is only for the UI. The server checks the session cookie on every request.
   */
  account: Account | null
  /** True when the student chose to use the app without signing in. */
  guest: boolean
  signIn: (user: GoogleUser) => void
  signInAccount: (account: Account) => void
  continueAsGuest: () => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      account: null,
      guest: false,
      signIn: (user) => set({ user, account: null, guest: false }),
      signInAccount: (account) => set({ account, user: null, guest: false }),
      continueAsGuest: () => set({ user: null, account: null, guest: true }),
      signOut: () => {
        // Stop Google from silently signing the same account back in.
        window.google?.accounts?.id?.disableAutoSelect()
        // End the server session too. The UI signs out either way.
        if (get().account) accountsApi.logout().catch(() => {})
        set({ user: null, account: null, guest: false })
      },
    }),
    {
      name: 'college-hub.auth',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ user: s.user, account: s.account, guest: s.guest }),
    },
  ),
)

export const useIsSignedIn = () => useAuthStore((s) => s.user !== null || s.account !== null || s.guest)

export const useIsAdmin = () => useAuthStore((s) => s.account?.role === 'admin')

/** Name, email and photo for whoever is signed in, whichever way they signed in. */
export interface Profile {
  name: string
  email: string
  picture?: string
}

export const useProfile = (): Profile | null => {
  const user = useAuthStore((s) => s.user)
  const account = useAuthStore((s) => s.account)
  return user ?? (account ? { name: account.name, email: account.email } : null)
}
