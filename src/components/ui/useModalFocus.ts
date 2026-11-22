import { useEffect, type KeyboardEvent, type MouseEvent, type RefObject } from 'react'

// A radio group is one Tab stop, so only its checked radio counts.
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type=radio]), input[type=radio]:checked, select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus for a modal panel: moves in on open, stays in with Tab, and goes back on close.
 * Returns the key handler, which also closes on Escape.
 */
export function useModalFocus(panel: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = panel.current
    const target =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea') ??
      el
    target?.focus()
    return () => previous?.focus?.()
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

/** For the backdrop. Without preventDefault, the press would move focus away after it has gone back. */
export const closeOnPress = (onClose: () => void) => (e: MouseEvent) => {
  e.preventDefault()
  onClose()
}
