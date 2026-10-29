import type { ReactNode } from 'react'
import { MapPin } from 'lucide-react'
import type { HeroState } from '@/types'
import { Button } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Chip'
import { navigate } from '@/lib/route'
import {
  describeDay,
  formatClock,
  formatDuration,
  formatRange,
  plural,
  toMinutes,
} from '@/lib/time'
import { cn } from '@/lib/cn'
import { dueLabel } from '@/features/assignments/urgency'
import { ClockFace } from '@/features/hero/ClockFace'
import { openNoteForSession } from '@/features/notes/startNote'
import { useCourseMap } from '@/store/selectors'
import { useUiStore } from '@/store/useUiStore'

const TONE_CLASS = { bad: 'text-bad', warn: 'text-warn', normal: 'text-muted', faint: 'text-faint' } as const

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
      className="relative flex min-h-[244px] flex-col overflow-hidden rounded-3xl border border-line bg-raised px-[26px] pt-6 pb-[22px]"
    >
      <ClockFace
        now={now}
        arc={arc}
        className="pointer-events-none absolute -right-16 -bottom-[84px] size-[272px] max-sm:-right-16 max-sm:-bottom-[72px] max-sm:size-[190px]"
      />
      <div className="relative flex justify-between gap-3 text-[13px] text-muted">
        <span aria-live="polite" className={cn(accent && 'text-accent')}>
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
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/7">
          <i className="block h-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, bar * 100)).toFixed(1)}%` }} />
        </div>
      ) : null}
    </section>
  )
}

function ClassTitle({ code, name }: { code: string; name: string }) {
  return (
    <>
      <h2 className="relative mt-8 text-[clamp(34px,5vw,48px)] leading-[1.05] font-medium tracking-tight">{code}</h2>
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

  const { urgentTasks, next } = state
  const shown = urgentTasks.slice(0, 3)
  const anyOverdue = shown.some((t) => dueLabel(t, now).tone === 'bad')
  const nextCourse = next ? courses.get(next.session.courseId) : undefined
  return (
    <Shell now={now} status="Study mode" arc={next && next.start.getDate() === now.getDate() ? { from: nowMin, to: toMinutes(next.session.start) } : null}>
      <h2 className="relative mt-6 text-[clamp(26px,4vw,34px)] leading-tight font-medium tracking-tight">
        {shown.length === 0 ? 'You are all caught up' : anyOverdue ? 'Catch up first' : 'Focus time'}
      </h2>
      {shown.length > 0 ? (
        <ul className="relative mt-3 flex max-w-[62%] flex-col gap-1.5 max-sm:max-w-full">
          {shown.map((t) => {
            const due = dueLabel(t, now)
            return (
              <li key={t.id} className="flex items-baseline justify-between gap-4 text-[15px]">
                <span className="truncate">{t.title}</span>
                <span className={cn('shrink-0 text-xs', TONE_CLASS[due.tone])}>{due.text}</span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="relative mt-2 text-muted">Nothing is due in the next 7 days.</p>
      )}
      <div className="relative mt-auto flex flex-wrap items-center gap-3 pt-6 text-[13px] text-muted">
        {next ? (
          <>
            <Pill>{nextCourse?.code ?? 'Class'}</Pill>
            <span>
              Next class {describeDay(next.start, now).toLowerCase()} at {formatClock(toMinutes(next.session.start))}
            </span>
          </>
        ) : (
          <span>No classes on the schedule this week.</span>
        )}
        <Button size="sm" onClick={() => navigate('assignments')}>
          Open tasks
        </Button>
      </div>
    </Shell>
  )
}
