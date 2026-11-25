import { create } from 'zustand'
import type { ApiFeature } from '@/types'

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
  /** What the account's API can store, as it last reported. Empty from an API before 1.10.0. */
  features: readonly ApiFeature[]
}

export const CLOSED: SyncState = { accountId: null, phase: 'closed', status: 'saved', local: 'none', message: null, heldFor: null, features: [] }

export const useSyncStore = create<SyncState>()(() => CLOSED)

/**
 * Whether this feature's data can be kept: always for a guest (it stays in the browser), and
 * for an account only once its API has said so. Hide what this is false for.
 */
export const canStore = (s: Pick<SyncState, 'accountId' | 'features'>, feature: ApiFeature): boolean => s.accountId === null || s.features.includes(feature)
