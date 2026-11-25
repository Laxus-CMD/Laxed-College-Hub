import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import type { TaskMode } from '@/types'
import type { ModeDef } from './modes'

/**
 * A compact radio group: one mode at a time. Arrow keys move between modes and choose them,
 * as in any radio group, and only the chosen mode is a Tab stop.
 */
export function ModeSwitcher({ modes, value, onChange }: { modes: ModeDef[]; value: TaskMode; onChange: (mode: TaskMode) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    const to = e.key === 'Home' ? 0 : e.key === 'End' ? modes.length - 1 : step ? (i + step + modes.length) % modes.length : -1
    if (to < 0) return
    e.preventDefault()
    onChange(modes[to]!.id)
    refs.current[to]?.focus()
  }
  return (
    <div role="radiogroup" aria-label="Workspace mode" className="flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-lg bg-fill p-0.5">
      {modes.map((m, i) => {
        const active = m.id === value
        const Icon = m.icon
        return (
          <button
            key={m.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={m.purpose}
            onClick={() => onChange(m.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150',
              active ? 'bg-thumb text-ink shadow-thumb' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
