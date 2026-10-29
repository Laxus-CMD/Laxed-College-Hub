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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-medium tracking-tight text-balance max-sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-muted">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </header>
  )
}
