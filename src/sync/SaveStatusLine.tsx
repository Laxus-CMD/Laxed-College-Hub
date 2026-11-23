import { Dot } from '@/components/ui/Chip'
import { useStorageHealth } from '@/lib/storage'
import { useAuthStore } from '@/store/useAuthStore'
import { accountLine, guestLine } from '@/sync/statusLines'
import { useSyncStore } from '@/sync/useSyncStore'

/** One line that says where the data is and whether it is safe. The short one fits in the sidebar. */
export function SaveStatusLine({ full = false }: { full?: boolean }) {
  const hasAccount = useAuthStore((s) => s.account !== null)
  const status = useSyncStore((s) => s.status)
  const local = useSyncStore((s) => s.local)
  const storageOk = useStorageHealth((s) => s.ok)
  const line = hasAccount ? accountLine(status, local) : guestLine(storageOk)
  return (
    <span className="flex items-center gap-1.5 truncate" title={full ? undefined : line.full}>
      <Dot color={line.color} className="size-1.5" />
      {full ? line.full : line.short}
    </span>
  )
}
