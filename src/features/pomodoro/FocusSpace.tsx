import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useModalFocus } from '@/components/ui/useModalFocus'

type Tone = 'focus' | 'short-break' | 'long-break'

/** Lets the timer open Focus Space for a button elsewhere on the page. */
export interface FocusSpaceControl {
  enter: (returnTo?: HTMLElement | null) => void
}

interface Props {
  tone: Tone
  onToggleTimer: () => void
  children: ReactNode
  control?: Ref<FocusSpaceControl>
}

export function FocusSpace({ tone, onToggleTimer, children, control }: Props) {
  const [open, setOpen] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  /** The button that opened it, when that was not this card's own. */
  const returnTo = useRef<HTMLElement | null>(null)

  function close() {
    const el = panel.current
    if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => {})
    setOpen(false)
    ;(returnTo.current ?? trigger.current)?.focus()
  }

  function enter(from: HTMLElement | null = null) {
    returnTo.current = from
    // Mount inside the click/keydown so the native request retains user activation.
    flushSync(() => setOpen(true))
    const el = panel.current
    if (el?.requestFullscreen && document.fullscreenEnabled !== false) {
      void el.requestFullscreen().catch(() => {
        // The viewport-sized modal is also usable when the browser declines fullscreen.
      })
    }
  }

  const shortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return
    if (!open && document.querySelector('[aria-modal="true"], dialog[open]')) return
    // Rearranging the dashboard: keys belong to that, not to the timer.
    if (!open && document.querySelector('[data-dashboard-editing]')) return
    if (event.key.toLowerCase() === 'f') {
      event.preventDefault()
      if (open) close()
      else enter()
    } else if (event.code === 'Space' || event.key === ' ') {
      if (!open && !trigger.current?.closest('[aria-label="Pomodoro timer"]')?.contains(target)) return
      if (target?.closest('button, a[href]')) return
      event.preventDefault()
      onToggleTimer()
    }
  })

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => shortcut(event)
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [])

  useImperativeHandle(control, () => ({ enter }))

  useEffect(() => {
    if (!open) return
    const el = panel.current
    const opener = returnTo.current ?? trigger.current
    const root = document.getElementById('root')
    const wasInert = root?.inert
    if (root) root.inert = true
    const changed = () => {
      if (document.fullscreenElement !== el) setOpen(false)
    }
    document.addEventListener('fullscreenchange', changed)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      if (root) root.inert = wasInert ?? false
      opener?.focus()
    }
  }, [open])

  return <>
    <button type="button" ref={trigger} aria-label="Enter Focus Space" title="Enter Focus Space (F)" aria-haspopup="dialog" onClick={() => enter()}
      className="grid size-11 place-items-center rounded-full text-muted hover:bg-fill hover:text-ink">
      <Maximize2 size={16} aria-hidden="true" />
    </button>
    {open && createPortal(<FocusPanel tone={tone} panel={panel} onClose={close}>{children}</FocusPanel>, document.body)}
  </>
}

function FocusPanel({ tone, panel, onClose, children }: {
  tone: Tone
  panel: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  children: ReactNode
}) {
  const modalKeys = useModalFocus(panel, onClose)
  return <div ref={panel} role="dialog" aria-modal="true" aria-label="Focus Space" tabIndex={-1}
    onKeyDown={(e) => {
      if (e.key === 'Escape' && (e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) return
      modalKeys(e)
    }}
    className="focus-space fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-canvas text-ink outline-none">
    <div className="focus-atmosphere" data-tone={tone} aria-hidden="true">
      <i /><i /><i />
    </div>
    <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-4 sm:px-10 sm:py-6">
      <header className="flex items-center justify-between gap-4">
        <h2 data-autofocus tabIndex={-1} className="text-base font-semibold tracking-tight">Focus Space</h2>
        <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-fill px-4 text-sm font-medium">
          <Minimize2 size={16} aria-hidden="true" /> Exit Focus Space
        </button>
      </header>
      <div className="m-auto flex w-full max-w-xl flex-col items-center gap-3 py-5">{children}</div>
    </div>
  </div>
}
