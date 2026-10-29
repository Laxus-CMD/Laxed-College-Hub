import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn('rounded-[20px] border border-line bg-surface px-[22px] py-5', className)}
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
    <div className="mb-3.5 flex min-h-8 items-center justify-between gap-3">
      <h3 className="text-base font-medium">{title}</h3>
      <div className="flex items-center gap-2">
        {meta ? <span className="text-xs text-muted">{meta}</span> : null}
        {actions}
      </div>
    </div>
  )
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="py-1.5 text-muted">{children}</p>
}
