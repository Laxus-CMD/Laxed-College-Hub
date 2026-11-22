import { cn } from '@/lib/cn'

interface Option<T extends string> {
  value: T
  label: string
  count?: number
}

/** A pill-shaped tab strip. */
export function SegmentedTabs<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex w-fit max-w-full flex-wrap gap-0.5 rounded-[10px] bg-fill-strong p-0.5"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-[8px] px-3.5 py-1 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200',
              active ? 'bg-thumb text-ink shadow-thumb' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={cn('text-[11px]', active ? 'text-muted' : 'text-faint')}>{o.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Filter chip that toggles on and off. */
export function FilterChip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-colors duration-150',
        pressed
          ? 'border-transparent bg-ink text-canvas'
          : 'border-line text-muted hover:bg-fill hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
