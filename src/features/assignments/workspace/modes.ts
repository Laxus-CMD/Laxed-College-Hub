import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import { Columns3, ListChecks, type LucideIcon } from 'lucide-react'
import type { ApiFeature, TaskMode } from '@/types'
import ClassicMode from '@/features/assignments/classic/ClassicMode'

export interface ModeDef {
  id: TaskMode
  label: string
  /** What the mode is for, in a few words. Shown as the switcher's tooltip and read by screen readers. */
  purpose: string
  icon: LucideIcon
  /** What the mode saves that an older API cannot keep. The mode is hidden until the API can. */
  needs?: ApiFeature
  /** Classic is the default, so it loads with the page. Later modes can load on demand with `lazy`. */
  View: ComponentType | LazyExoticComponent<ComponentType>
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
  {
    id: 'flow',
    label: 'Flow',
    purpose: 'Move work that takes several sittings from Not started to Completed',
    icon: Columns3,
    needs: 'progress',
    View: lazy(() => import('@/features/assignments/flow/FlowMode')),
  },
]

/** The mode for an id, among those offered; Classic when it is not one of them. */
export const modeOf = (id: TaskMode | null | undefined, offered: readonly ModeDef[] = MODES): ModeDef => offered.find((m) => m.id === id) ?? MODES[0]!
