import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'

export function CheckButton({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-[7px] border-[1.5px] transition-colors',
        checked
          ? 'border-accent-fill bg-accent-fill text-white'
          : 'border-line-strong text-transparent hover:border-accent',
      )}
    >
      <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
    </button>
  )
}
