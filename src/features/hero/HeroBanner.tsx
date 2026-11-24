import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import type { HeroState } from '@/types'
import { Button } from '@/components/ui/Button'
import { formatDuration, formatRange, plural, toMinutes } from '@/lib/time'
import { cn } from '@/lib/cn'
import { ClockFace } from '@/features/hero/ClockFace'
import { StudyLaunchpad } from '@/features/hero/StudyLaunchpad'
import { openNoteForSession } from '@/features/notes/startNote'
import { useCourseMap } from '@/store/selectors'
import { useUiStore } from '@/store/useUiStore'

function Shell({
  now,
  arc,
  status,
  accent,
  room,
  children,
  bar,
}: {
  now: Date
  arc: { from: number; to: number } | null
  status: string
  accent?: boolean
  room?: string
  children: ReactNode
  bar?: number
}) {
  return (
    <section
      aria-label="Right now"
      className="relative flex min-h-[248px] flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <ClockFace
        now={now}
        arc={arc}
        className="pointer-events-none absolute -right-16 -bottom-[84px] size-[272px] text-ink max-sm:-right-16 max-sm:-bottom-[72px] max-sm:size-[190px]"
      />
      <div className="relative flex justify-between gap-3 text-[13px] font-medium text-muted">
        <span aria-live="polite" className={cn('inline-flex items-center gap-2', accent && 'text-accent')}>
          {accent ? <i className="size-1.5 animate-pulse rounded-full bg-accent-fill" aria-hidden="true" /> : null}
          {status}
        </span>
        {room ? (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <MapPin className="size-4" aria-hidden="true" />
            {room}
          </span>
        ) : null}
      </div>
      {children}
      {bar !== undefined ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-fill-strong">
          <i className="block h-full bg-accent-fill transition-[width] duration-1000" style={{ width: `${Math.min(100, Math.max(0, bar * 100)).toFixed(1)}%` }} />
        </div>
      ) : null}
    </section>
  )
}

function ClassTitle({ code, name }: { code: string; name: string }) {
  return (
    <>
      <h2 className="relative mt-8 text-[clamp(36px,5vw,52px)] leading-[1.04] font-semibold tracking-[-0.035em]">{code}</h2>
      <p className="relative mt-1.5 text-lg text-muted">{name}</p>
    </>
  )
}

/** The top card on Overview. Its content follows the time of day. */
export function HeroBanner({ state, now }: { state: HeroState; now: Date }) {
  const courses = useCourseMap()
  const openDrawer = useUiStore((s) => s.openDrawer)
  const nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60

  if (state.kind === 'in-class') {
    const s = state.session
    const course = courses.get(s.courseId)
    return (
      <Shell
        now={now}
        status={`In class now, ${plural(state.minutesLeft, 'minute')} left`}
        accent
        room={s.room}
        bar={state.progress}
        arc={{ from: toMinutes(s.start), to: toMinutes(s.end) }}
      >
        <ClassTitle code={course?.code ?? 'Class'} name={course?.name ?? ''} />
        <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6 text-[13px] text-muted">
          <span>Today, {formatRange(s.start, s.end)}</span>
          <Button size="sm" variant="primary" onClick={() => openNoteForSession(s, now)}>
            Take notes
          </Button>
        </div>
      </Shell>
    )
  }

  if (state.kind === 'between-classes') {
    const s = state.next
    const course = courses.get(s.courseId)
    return (
      <Shell
        now={now}
        status={`Next class in ${formatDuration(state.minutesUntil)}`}
        room={s.room}
        arc={{ from: nowMin, to: toMinutes(s.start) }}
      >
        <ClassTitle code={course?.code ?? 'Class'} name={course?.name ?? ''} />
        <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6 text-[13px] text-muted">
          <span>Today, {formatRange(s.start, s.end)}</span>
          <Button size="sm" onClick={() => openDrawer(s.id)}>
            Class details
          </Button>
        </div>
      </Shell>
    )
  }

  // Study mode: no class now or soon.
  return <StudyLaunchpad now={now} next={state.next} />
}
