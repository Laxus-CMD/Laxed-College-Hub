import type { LocalCopy, SaveStatus } from '@/sync/useSyncStore'

/** The words and color for the save status. Kept apart from the components so both can use them. */
export interface Line {
  short: string
  full: string
  color: string
}

const GOOD = 'var(--color-good)'
const WARN = 'var(--color-warn)'
const BAD = 'var(--color-bad)'

/**
 * Says where the latest changes are, from safest to least safe:
 * in the account, kept on this device, or only in this tab.
 */
export function accountLine(status: SaveStatus, local: LocalCopy): Line {
  if (status === 'saved') return { short: 'Saved', full: 'Everything is saved to your account.', color: GOOD }
  if (local === 'memory') {
    return {
      short: 'Only in this tab',
      full:
        status === 'blocked'
          ? 'Your latest changes could not be saved, and this browser will not keep a copy. They are only in this tab.'
          : 'This browser will not keep a copy of your latest changes, so they are only in this tab until they reach your account. Keep it open.',
      color: BAD,
    }
  }
  if (status === 'blocked') {
    return {
      short: 'Not saved to account',
      full: 'Your latest changes are kept on this device, but your account could not take them.',
      color: BAD,
    }
  }
  if (status === 'retrying') {
    return {
      short: 'On this device',
      full: 'Your latest changes are kept on this device but are not in your account yet. They will be saved when the connection is back, even after a reload.',
      color: WARN,
    }
  }
  return {
    short: 'Saving…',
    full: local === 'device' ? 'Kept on this device. Saving to your account…' : 'Saving to your account…',
    color: WARN,
  }
}

export function guestLine(storageOk: boolean): Line {
  return storageOk
    ? { short: 'Not backed up', full: 'Saved only in this browser.', color: WARN }
    : {
        short: 'Not saved',
        full: 'This browser is not letting College Hub save, so your changes will be gone when you close this page. Download your data to keep a copy.',
        color: BAD,
      }
}
