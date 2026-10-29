import type { ReactNode } from 'react'
import type { Course } from '@/types'
import { cn } from '@/lib/cn'

/** Small colored tag for a course. */
export function CourseChip({ course, children }: { course: Pick<Course, 'code' | 'color'>; children?: ReactNode }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs"
      style={{ backgroundColor: `color-mix(in srgb, ${course.color} 16%, transparent)` }}
    >
      <i className="size-[7px] rounded-full" style={{ background: course.color }} />
      {course.code}
      {children}
    </span>
  )
}

type Tone = 'accent' | 'bad' | 'warn' | 'good'

const TONES: Record<Tone, string> = {
  accent: 'bg-accent/15 text-accent',
  bad: 'bg-bad/15 text-bad',
  warn: 'bg-warn/15 text-warn',
  good: 'bg-good/15 text-good',
}

export function Pill({ tone = 'accent', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <i className={cn('inline-block size-2 shrink-0 rounded-full', className)} style={{ background: color }} />
}
