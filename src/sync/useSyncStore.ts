import { create } from 'zustand'

export type SyncPhase = 'closed' | 'loading' | 'load-error' | 'ready'
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'retrying' | 'blocked'

/** What the student sees about loading and saving. Only the sync engine writes here. */
interface SyncState {
  /** The account whose data is in the app, or being loaded. */
  accountId: string | null
  phase: SyncPhase
  status: SaveStatus
  message: string | null
  /** Email of an account with changes that could not be saved before its session ended. */
  heldFor: string | null
}

export const CLOSED: SyncState = { accountId: null, phase: 'closed', status: 'saved', message: null, heldFor: null }

export const useSyncStore = create<SyncState>()(() => CLOSED)
