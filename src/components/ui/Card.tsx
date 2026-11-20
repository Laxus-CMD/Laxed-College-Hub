import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-line bg-surface p-5 shadow-card dark:border-transparent sm:p-6',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  title,
  meta,
  actions,
}: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-3">
      <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
      <div className="flex items-center gap-2">
        {meta ? <span className="text-xs text-muted tabular-nums">{meta}</span> : null}
        {actions}
      </div>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-muted">{children}</p>
}
