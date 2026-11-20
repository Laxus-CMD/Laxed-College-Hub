import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { GoogleUser } from '@/features/auth/google'

/** Google profile photo, falling back to an initial (or a person icon for guests). */
export function Avatar({ user, className }: { user: GoogleUser | null; className?: string }) {
  const [broken, setBroken] = useState(false)
  const base = cn('grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-fill-strong text-[12px] font-semibold text-muted', className)
  if (user?.picture && !broken) {
    return <img src={user.picture} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn(base, 'object-cover')} />
  }
  return (
    <span aria-hidden="true" className={base}>
      {user ? user.name.charAt(0).toUpperCase() : <UserRound className="size-4" />}
    </span>
  )
}
