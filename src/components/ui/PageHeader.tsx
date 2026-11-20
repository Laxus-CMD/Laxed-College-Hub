import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div>
        <h1 className="text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance max-sm:text-[26px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  )
}
