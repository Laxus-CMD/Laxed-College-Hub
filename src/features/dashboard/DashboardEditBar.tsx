import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { defaultLayout, sameLayout, WIDGETS, type DashboardLayout, type WidgetId } from '@/features/dashboard/layout'

/** On touch screens the buttons grow to a comfortable 44 px. */
const TOUCH = 'pointer-coarse:h-11'

/**
 * The bar shown while editing the dashboard: what mode this is, which widgets show,
 * reset, and Done. It stays in view while scrolling down to the bottom row.
 */
export function DashboardEditBar({
  layout,
  onToggle,
  onReset,
  onDone,
}: {
  layout: DashboardLayout
  onToggle: (id: WidgetId, hidden: boolean) => void
  onReset: () => void
  onDone: () => void
}) {
  const id = useId()
  const [managing, setManaging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const done = useRef<HTMLButtonElement>(null)
  const isDefault = sameLayout(layout, defaultLayout())
  const showing = WIDGETS.length - layout.hidden.length

  // Entering editing puts the keyboard on Done, so leaving is one key away.
  useEffect(() => done.current?.focus(), [])

  return (
    <section
      aria-label="Dashboard editing"
      className="sticky top-3 z-30 mb-5 animate-[fade-in_180ms_ease-out] rounded-2xl border border-line bg-surface/95 shadow-pop backdrop-blur-md"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 pr-2 pl-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          <i className="size-2 rounded-full bg-accent-fill" aria-hidden="true" />
          Editing dashboard
        </p>
        <p className="text-xs text-muted max-sm:hidden">Drag a handle to move a widget.</p>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className={TOUCH}
            aria-expanded={managing}
            aria-controls={`${id}-widgets`}
            onClick={() => setManaging((v) => !v)}
          >
            Manage widgets
            <span className="text-muted tabular-nums">
              {showing}/{WIDGETS.length}
            </span>
            <ChevronDown className={cn('size-3.5 transition-transform duration-200', managing && 'rotate-180')} aria-hidden="true" />
          </Button>
          {confirming ? (
            <span className="flex items-center gap-1.5" role="group" aria-label="Reset to default?">
              <span className="px-1 text-xs text-muted">Reset order and visibility?</span>
              <Button
                size="sm"
                variant="destructive"
                className={TOUCH}
                onClick={() => {
                  setConfirming(false)
                  onReset()
                }}
              >
                Reset
              </Button>
              <Button size="sm" variant="subtle" className={TOUCH} onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="subtle" className={TOUCH} disabled={isDefault} onClick={() => setConfirming(true)}>
              Reset to default
            </Button>
          )}
          <Button ref={done} size="sm" variant="primary" className={TOUCH} onClick={onDone}>
            Done
          </Button>
        </div>
      </div>

      {managing ? (
        <ul id={`${id}-widgets`} className="grid gap-0.5 border-t border-line p-2 sm:grid-cols-2 lg:grid-cols-3">
          {WIDGETS.map((w) => {
            const on = !layout.hidden.includes(w.id)
            return (
              <li key={w.id}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() => onToggle(w.id, on)}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 text-left text-[13.5px] transition-colors hover:bg-fill"
                >
                  <span className={cn(!on && 'text-muted')}>{w.title}</span>
                  <span
                    aria-hidden="true"
                    className={cn('relative h-[22px] w-9 shrink-0 rounded-full transition-colors duration-200', on ? 'bg-accent-fill' : 'bg-fill-strong')}
                  >
                    <i
                      className={cn(
                        'absolute top-[2px] left-[2px] size-[18px] rounded-full bg-white shadow-thumb transition-transform duration-200 ease-(--ease-apple)',
                        on && 'translate-x-[14px]',
                      )}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
