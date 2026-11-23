import { create } from 'zustand'

export type SyncPhase = 'closed' | 'loading' | 'load-error' | 'ready'
export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'retrying' | 'blocked'
/**
 * Where changes the server has not confirmed are right now.
 * - none: there are none, or they are about to be written down
 * - device: kept in this browser, so they survive a reload, a crash or signing in again
 * - memory: the browser refused to keep them, so they are only in this tab
 */
export type LocalCopy = 'none' | 'device' | 'memory'

/** What the student sees about loading and saving. Only the sync engine writes here. */
interface SyncState {
  /** The account whose data is in the app, or being loaded. */
  accountId: string | null
  phase: SyncPhase
  status: SaveStatus
  local: LocalCopy
  message: string | null
  /** Email of another account with changes on this device that are not in that account yet. */
  heldFor: string | null
}

export const CLOSED: SyncState = { accountId: null, phase: 'closed', status: 'saved', local: 'none', message: null, heldFor: null }

export const useSyncStore = create<SyncState>()(() => CLOSED)
