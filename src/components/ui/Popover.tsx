import { useEffect, useEffectEvent, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { placeNear, type PopoverAnchor } from '@/components/ui/placeNear'
import { FOCUSABLE, useModalFocus } from '@/components/ui/useModalFocus'

export type { PopoverAnchor }



/**
 * A small panel next to what opened it, for details and quick edits. Focus moves in and stays
 * in while it is open, Escape or a press outside closes it, and focus goes back afterwards.
 */
export function Popover({
  anchor,
  label,
  onClose,
  children,
  className,
}: {
  anchor: PopoverAnchor
  label: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const keys = useModalFocus(panel, onClose)
  const close = useEffectEvent(onClose)

  // Below the anchor, or above when there is no room, always inside the window.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const place = () => placeNear(el, anchor)
    place()
    // Content can change size while open (an error message, a longer title).
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place)
    observer?.observe(el)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close()
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      // Focusable itself, so a panel without a text field (a day's list) still takes focus when it opens.
      tabIndex={-1}
      onKeyDown={(e) => {
        // From the panel itself, Tab goes to its first control and Shift+Tab to its last, never behind it.
        if (e.key === 'Tab' && e.target === panel.current) {
          const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
          const next = e.shiftKey ? items.at(-1) : items[0]
          if (next) {
            e.preventDefault()
            next.focus()
            return
          }
        }
        keys(e)
      }}
      style={{ visibility: 'hidden' }}
      className={cn(
        // Never taller than the window: a long list scrolls inside, so its last action stays reachable.
        'fixed top-0 left-0 z-40 max-h-[calc(100dvh-1.5rem)] w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-raised p-4 text-ink shadow-pop outline-none motion-safe:animate-[pop-in_160ms_var(--ease-apple)] dark:border-line-strong',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}
