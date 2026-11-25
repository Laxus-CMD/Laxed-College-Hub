import { useEffect, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'

// A radio group is one Tab stop, so only its checked radio counts.
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=radio]), input[type=radio]:checked, select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus for a modal panel: moves in on open, stays in with Tab, and goes back on close.
 * Returns the key handler, which also closes on Escape.
 */
export function useModalFocus(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // If the opener is gone when this closes (its task moved to another day or column), focus goes
    // to the same task where it is now, so keyboard and screen-reader users keep their place.
    const taskId = previous?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId
    const el = panel.current
    const target =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea') ??
      el
    target?.focus()
    return () => restoreFocus(previous, taskId)
  }, [panel])

  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    const first = items[0]
    const last = items[items.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

function restoreFocus(previous: HTMLElement | null, taskId: string | undefined) {
  if (previous?.isConnected) return previous.focus?.()
  if (!taskId) return
  // After this render settles: the task's new element is in the page by then.
  requestAnimationFrame(() => {
    const now = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`)
    const target = now?.matches(FOCUSABLE) ? now : now?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
  })
}

/** For the backdrop. Without preventDefault, the press would move focus away after it has gone back. */
export const closeOnPress = (onClose: () => void) => (e: MouseEvent) => {
  e.preventDefault()
  onClose()
}
