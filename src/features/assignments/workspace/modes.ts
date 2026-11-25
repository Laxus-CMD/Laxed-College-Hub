import type { ComponentType } from 'react'
import { ListChecks, type LucideIcon } from 'lucide-react'
import type { TaskMode } from '@/types'
import ClassicMode from '@/features/assignments/classic/ClassicMode'

export interface ModeDef {
  id: TaskMode
  label: string
  /** What the mode is for, in a few words. Shown as the switcher's tooltip and read by screen readers. */
  purpose: string
  icon: LucideIcon
  /** Classic is the default, so it loads with the page. Later modes can load on demand with `lazy`. */
  View: ComponentType
}

/**
 * The modes this version offers, in switcher order. Each one is a different way of working
 * on the same tasks; a mode not listed here yet opens Classic instead.
 */
export const MODES: ModeDef[] = [
  {
    id: 'classic',
    label: 'Classic',
    purpose: 'Every open task, grouped by when it is due',
    icon: ListChecks,
    View: ClassicMode,
  },
]

export const modeOf = (id: TaskMode | null | undefined): ModeDef => MODES.find((m) => m.id === id) ?? MODES[0]!
