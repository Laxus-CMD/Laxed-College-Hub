import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from '@/components/ui/Button'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** "drawer" slides in from the right. */
  variant?: 'modal' | 'drawer'
  wide?: boolean
}

/** Modal or side drawer. Traps focus, closes on Escape or a click outside, and returns focus on close. */
export function Dialog({ title, onClose, children, variant = 'modal', wide = false }: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = panel.current
    const target =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea') ??
      el
    target?.focus()
    return () => previous?.focus?.()
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
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

  const drawer = variant === 'drawer'
  return (
    <div
      className={cn('fixed inset-0 z-50 flex', drawer ? 'justify-end' : 'items-center justify-center p-4')}
      onKeyDown={onKeyDown}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" onMouseDown={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative max-h-full overflow-y-auto border border-line-strong bg-surface p-6 shadow-[0_30px_80px_rgba(0,0,0,0.6)] outline-none',
          drawer ? 'h-full w-full max-w-[420px] rounded-l-[28px]' : 'w-full rounded-[22px]',
          !drawer && (wide ? 'max-w-[640px]' : 'max-w-[480px]'),
        )}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-medium">
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-[18px]" aria-hidden="true" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}
