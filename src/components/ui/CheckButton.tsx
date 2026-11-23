import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A round checkbox. Hovering shows a faint check; completing fills it and the check springs in.
 * Motion turns off with the system's reduced-motion setting (src/index.css).
 */
export function CheckButton({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'group/check grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-200 ease-(--ease-apple) active:scale-90',
        checked ? 'border-accent-fill bg-accent-fill text-on-accent' : 'border-line-strong text-accent hover:border-accent',
      )}
    >
      <Check
        className={cn(
          'size-3.5 transition-[opacity,transform] duration-300 ease-(--ease-spring)',
          checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0 group-hover/check:scale-90 group-hover/check:opacity-40',
        )}
        strokeWidth={3}
        aria-hidden="true"
      />
    </button>
  )
}
