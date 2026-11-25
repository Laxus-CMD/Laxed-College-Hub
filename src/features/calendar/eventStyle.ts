import { createContext, use, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { Task } from '@/types'

/**
 * How things look on the calendar. Restrained on purpose: course color appears as a small
 * marker and a faint tint, never a block of saturated color. Each kind has its own shape:
 *   class       faint tint, a thin colored line, a hairline border
 *   assignment  an open circle in the course color
 *   exam        a filled diamond in the course color, bolder, with a colored border
 *   to-do       neutral, an open circle in gray
 *   done        quieter, struck through, a filled check
 */
export const tint = (color: string | undefined, pct: number) => `color-mix(in srgb, ${color ?? 'var(--color-faint)'} ${pct}%, var(--color-surface))`

/** The look of a task, wherever it sits. */
export function taskLook(task: Task, color: string | undefined): { className: string; style: CSSProperties } {
  if (task.done) return { className: 'text-muted', style: { background: 'var(--color-fill)' } }
  if (task.category === 'exam') return { className: 'font-semibold border', style: { background: tint(color, 12), borderColor: tint(color, 45) } }
  if (task.kind === 'todo') return { className: '', style: { background: 'var(--color-fill)' } }
  return { className: '', style: { background: tint(color, 9) } }
}

/** A short label for a task's place and time, for buttons and screen readers. */
export const taskLabel = (task: Task, when: string) => `${task.title}, ${task.category === 'exam' ? 'exam' : 'due'}${when}${task.done ? ', done' : ''}`

interface Hover {
  show: (el: HTMLElement, content: ReactNode) => void
  hide: () => void
}
export const HoverContext = createContext<Hover>({ show: () => {}, hide: () => {} })

/** Full details on hover, after a short pause. Mouse only: touch and keyboard get the same in the item's label and panel. */
export function useHoverDetails(content: () => ReactNode) {
  const hover = use(HoverContext)
  return {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') hover.show(e.currentTarget, content())
    },
    onPointerLeave: () => hover.hide(),
    onPointerDown: () => hover.hide(),
  }
}
