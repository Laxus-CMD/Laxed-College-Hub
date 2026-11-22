import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { accountsApi, type Account } from '@/features/auth/api'
import { persistStorage } from '@/lib/storage'

interface AuthState {
  /**
   * The signed-in College Hub account, or null. This copy
   * is only for the UI. The server checks the session cookie on every request.
   */
  account: Account | null
  /** True when the student chose to use the app without signing in. */
  guest: boolean
  signInAccount: (account: Account) => void
  continueAsGuest: () => void
  signOut: () => void
  /** The account is already gone on the server. */
  accountDeleted: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      account: null,
      guest: false,
      signInAccount: (account) => set({ account, guest: false }),
      continueAsGuest: () => set({ account: null, guest: true }),
      signOut: () => {
        // Stop Google from silently signing the same account back in.
        window.google?.accounts?.id?.disableAutoSelect()
        // End the server session too. The UI signs out either way.
        if (get().account) accountsApi.logout().catch(() => {})
        set({ account: null, guest: false })
      },
      accountDeleted: () => {
        window.google?.accounts?.id?.disableAutoSelect()
        set({ account: null, guest: false })
      },
    }),
    {
      name: 'college-hub.auth',
      version: 2,
      // Version 1 kept a Google profile that no server had checked. Those people sign in once more.
      migrate: (old) => ({ account: null, guest: (old as { guest?: boolean } | null)?.guest ?? false }),
      storage: persistStorage,
      partialize: (s) => ({ account: s.account, guest: s.guest }),
    },
  ),
)

export const useIsSignedIn = () => useAuthStore((s) => s.account !== null || s.guest)

export const useIsAdmin = () => useAuthStore((s) => s.account?.role === 'admin')

/** Name, email and photo for whoever is signed in. */
export interface Profile {
  name: string
  email: string
  picture?: string
}

export const useProfile = (): Profile | null => {
  const account = useAuthStore((s) => s.account)
  return account ? { name: account.name, email: account.email, picture: account.picture ?? undefined } : null
}
