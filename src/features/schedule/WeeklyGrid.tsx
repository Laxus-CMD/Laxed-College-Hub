import type { MouseEvent } from 'react'
import type { Weekday } from '@/types'
import { cn } from '@/lib/cn'
import { formatRange, fromMinutes, startOfWeek, toMinutes, WEEK_ORDER, WEEKDAY_SHORT, addDays } from '@/lib/time'
import { layoutDay } from '@/features/schedule/scheduleUtils'
import { useCourseMap } from '@/store/selectors'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

const PX_PER_HOUR = 56

/** A Monday-first week grid. Click a class to open it, or an empty slot to add one. */
export function WeeklyGrid({ now }: { now: Date }) {
  const sessions = useScheduleStore((s) => s.sessions)
  const courses = useCourseMap()
  const openDrawer = useUiStore((s) => s.openDrawer)
  const openDialog = useUiStore((s) => s.openDialog)

  const days: Weekday[] = sessions.some((s) => s.days.includes(0)) ? WEEK_ORDER : WEEK_ORDER.slice(0, 6)
  const minutes = sessions.flatMap((s) => [toMinutes(s.start), toMinutes(s.end)])
  const startHour = Math.min(7, Math.floor(Math.min(...minutes, 420) / 60))
  const endHour = Math.max(20, Math.ceil(Math.max(...minutes, 1200) / 60))
  const height = (endHour - startHour) * PX_PER_HOUR
  const monday = startOfWeek(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cols = days.length

  const addAt = (day: Weekday) => (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top
    const snapped = Math.round((startHour * 60 + (y / PX_PER_HOUR) * 60) / 15) * 15
    const start = Math.max(0, Math.min(snapped, 22 * 60))
    openDialog({
      type: 'session',
      preset: { days: [day], start: fromMinutes(start), end: fromMinutes(Math.min(start + 90, 23 * 60 + 45)) },
    })
  }

  const gridCols = { gridTemplateColumns: `56px repeat(${cols}, minmax(112px, 1fr))`, minWidth: 56 + cols * 112 }

  return (
    <div className="max-h-[calc(100vh-200px)] min-h-[420px] overflow-auto rounded-[20px] border border-line bg-surface">
      <div className="sticky top-0 z-[4] grid border-b border-line bg-surface" style={gridCols}>
        <div />
        {days.map((d) => {
          const date = addDays(monday, WEEK_ORDER.indexOf(d))
          const today = d === now.getDay()
          return (
            <div
              key={d}
              className={cn('flex flex-col gap-0.5 border-l border-line px-2 pt-3 pb-2.5 text-center text-xs', today ? 'text-accent' : 'text-muted')}
            >
              <span>{WEEKDAY_SHORT[d]}</span>
              <b className={cn('text-lg leading-tight font-medium', today ? 'text-accent' : 'text-ink')}>{date.getDate()}</b>
            </div>
          )
        })}
      </div>
      <div className="relative grid" style={{ ...gridCols, height }}>
        <div className="relative">
          {Array.from({ length: endHour - startHour + 1 }, (_, i) =>
            i === 0 ? null : (
              <span
                key={i}
                className="absolute right-2 -translate-y-1/2 text-[11px] whitespace-nowrap text-faint"
                style={{ top: i * PX_PER_HOUR }}
              >
                {((startHour + i) % 12 || 12) + (startHour + i >= 12 ? ' PM' : ' AM')}
              </span>
            ),
          )}
        </div>
        {days.map((d) => {
          const today = d === now.getDay()
          return (
            <div
              key={d}
              data-day={d}
              role="presentation"
              onClick={addAt(d)}
              className={cn('relative cursor-cell border-l border-line', today && 'bg-accent/5')}
              style={{
                backgroundImage: `repeating-linear-gradient(to bottom, var(--color-line) 0, var(--color-line) 1px, transparent 1px, transparent ${PX_PER_HOUR}px)`,
              }}
            >
              {layoutDay(sessions, d).map((b) => {
                const course = courses.get(b.session.courseId)
                const h = ((b.end - b.start) / 60) * PX_PER_HOUR - 2
                const short = h < 46
                const range = formatRange(b.session.start, b.session.end)
                return (
                  <button
                    key={b.session.id}
                    type="button"
                    onClick={() => openDrawer(b.session.id)}
                    aria-label={`${course?.code ?? 'Class'}, ${range}${b.session.room ? `, ${b.session.room}` : ''}`}
                    className={cn(
                      'absolute z-[1] flex cursor-pointer overflow-hidden rounded-[10px] border-l-[3px] px-[9px] text-left text-xs leading-snug transition-colors',
                      short ? 'items-center gap-2 py-0.5' : 'flex-col gap-px py-1.5',
                    )}
                    style={{
                      top: ((b.start - startHour * 60) / 60) * PX_PER_HOUR,
                      height: h,
                      left: `calc(${(b.lane / b.lanes) * 100}% + 4px)`,
                      width: `calc(${100 / b.lanes}% - 8px)`,
                      borderLeftColor: course?.color,
                      backgroundColor: `color-mix(in srgb, ${course?.color ?? '#a58bff'} 22%, var(--color-surface))`,
                    }}
                  >
                    <b className="truncate text-[13px] font-medium">{course?.code ?? 'Class'}</b>
                    <span className="truncate text-muted">{range}</span>
                    {b.session.room && !short ? <span className="truncate text-muted">{b.session.room}</span> : null}
                  </button>
                )
              })}
              {today && nowMin >= startHour * 60 && nowMin <= endHour * 60 ? (
                <div
                  data-testid="now-line"
                  className="pointer-events-none absolute inset-x-0 z-[2] h-0.5 bg-bad before:absolute before:-top-[3px] before:-left-1 before:size-2 before:rounded-full before:bg-bad before:content-['']"
                  style={{ top: ((nowMin - startHour * 60) / 60) * PX_PER_HOUR }}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
