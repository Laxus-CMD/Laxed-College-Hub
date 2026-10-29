import { Card, CardHeader, EmptyNote } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Chip'
import { formatClock, toMinutes, WEEKDAY_NAMES } from '@/lib/time'
import { cn } from '@/lib/cn'
import { useCourseMap } from '@/store/selectors'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

/** Today's classes, with the one in progress highlighted. */
export function TodayCard({ now }: { now: Date }) {
  const sessions = useScheduleStore((s) => s.sessions)
  const courses = useCourseMap()
  const openDrawer = useUiStore((s) => s.openDrawer)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const today = sessions
    .filter((s) => s.days.includes(now.getDay() as 0))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start))

  return (
    <Card aria-label="Today">
      <CardHeader
        title="Today"
        meta={`${WEEKDAY_NAMES[now.getDay()]}, ${today.length} ${today.length === 1 ? 'class' : 'classes'}`}
      />
      {today.length === 0 ? (
        <EmptyNote>No classes today.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {today.map((s) => {
            const course = courses.get(s.courseId)
            const start = toMinutes(s.start)
            const end = toMinutes(s.end)
            const state = end <= nowMin ? 'done' : start <= nowMin ? 'now' : 'next'
            const clock = formatClock(start)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => openDrawer(s.id)}
                  className={cn(
                    'grid w-full cursor-pointer grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border-l-[3px] px-3 py-2.5 text-left',
                    state === 'now' ? 'bg-accent/15' : 'bg-canvas hover:bg-white/5',
                    state === 'done' && 'opacity-45',
                  )}
                  style={{ borderLeftColor: course?.color }}
                >
                  <span className="leading-tight font-medium tabular-nums">
                    {clock.slice(0, -3)}
                    <small className="block text-[11px] font-normal text-faint">{clock.slice(-2)}</small>
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate font-medium">{course?.code ?? 'Class'}</b>
                    <span className="text-xs text-muted">
                      {s.room ? `${s.room}, ` : ''}until {formatClock(end)}
                    </span>
                  </span>
                  {state === 'now' ? <Pill>Now</Pill> : state === 'done' ? <span className="text-xs text-faint">Done</span> : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
