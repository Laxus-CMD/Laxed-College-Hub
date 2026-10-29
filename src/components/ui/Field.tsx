import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const FIELD_BASE =
  'rounded-xl border border-line bg-canvas px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none'

/** Shared look for inputs. A width or height in `className` replaces the default, so `w-24` really is 96px. */
function fieldClass(className?: string, extra = ''): string {
  const all = `${extra} ${className ?? ''}`
  const hasWidth = /(^|\s)w-/.test(all)
  const hasHeight = /(^|\s)h-/.test(all)
  return cn(FIELD_BASE, !hasWidth && 'w-full', !hasHeight && 'h-10', extra, className)
}

export function Label({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5 text-[13px] text-muted', className)}>
      {label}
      {children}
    </label>
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={fieldClass(className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={fieldClass(className, 'pr-2')} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={fieldClass(className, 'h-auto min-h-28 py-3 leading-relaxed')} {...props} />
}

/** A row of radio or checkbox buttons that look like chips. */
export function ChoiceGroup({ legend, children, className }: { legend: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 p-0 text-[13px] text-muted">{legend}</legend>
      <div className={cn('flex flex-wrap gap-1.5', className)}>{children}</div>
    </fieldset>
  )
}

export function Choice({
  type,
  name,
  value,
  checked,
  onChange,
  children,
  className,
}: {
  type: 'radio' | 'checkbox'
  name: string
  value: string
  checked: boolean
  onChange: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <label className="relative">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="peer absolute inset-0 m-0 cursor-pointer opacity-0"
      />
      <span
        className={cn(
          'block rounded-[10px] border border-line-strong px-3.5 py-2 text-[13px] text-muted transition-colors hover:text-ink peer-checked:border-accent peer-checked:bg-accent/15 peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          className,
        )}
      >
        {children}
      </span>
    </label>
  )
}
