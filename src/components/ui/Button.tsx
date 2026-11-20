import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'ghost' | 'danger' | 'destructive' | 'subtle'
type Size = 'md' | 'sm'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-fill text-on-accent hover:bg-accent-hover',
  ghost: 'bg-fill text-ink hover:bg-fill-strong',
  danger: 'bg-bad/10 text-bad hover:bg-bad/15',
  /** Solid red, for the second click of a confirm. */
  destructive: 'bg-bad text-white hover:bg-bad/90',
  subtle: 'text-muted hover:bg-fill hover:text-ink',
}

const SIZES: Record<Size, string> = {
  md: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-[13px]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'ghost', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,color,transform] duration-150 select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

export function IconButton({ label, className, type = 'button', children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors duration-150 hover:bg-fill-strong hover:text-ink active:scale-95',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
