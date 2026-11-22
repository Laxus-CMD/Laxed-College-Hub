import { Dot } from '@/components/ui/Chip'
import { useAuthStore } from '@/store/useAuthStore'
import { useSyncStore, type SaveStatus } from '@/sync/useSyncStore'

const LINES: Record<SaveStatus, { short: string; full: string; color: string }> = {
  saved: { short: 'Saved', full: 'Everything is saved to your account.', color: 'var(--color-good)' },
  unsaved: { short: 'Saving…', full: 'Saving to your account…', color: 'var(--color-warn)' },
  saving: { short: 'Saving…', full: 'Saving to your account…', color: 'var(--color-warn)' },
  retrying: { short: 'Not saved yet', full: 'Your latest changes are not saved yet. Still trying.', color: 'var(--color-bad)' },
  blocked: { short: 'Not saved', full: 'Your latest changes are not saved.', color: 'var(--color-bad)' },
}
const GUEST = { short: 'Not backed up', full: 'Saved only in this browser.', color: 'var(--color-warn)' }

/** One line that says where the data is and whether it is safe. The short one fits in the sidebar. */
export function SaveStatusLine({ full = false }: { full?: boolean }) {
  const hasAccount = useAuthStore((s) => s.account !== null)
  const status = useSyncStore((s) => s.status)
  const line = hasAccount ? LINES[status] : GUEST
  return (
    <span className="flex items-center gap-1.5 truncate">
      <Dot color={line.color} className="size-1.5" />
      {full ? line.full : line.short}
    </span>
  )
}
