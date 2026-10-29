import { Card, CardHeader } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Chip'
import { addDays, dateKey, plural, startOfDay, WEEKDAY_SHORT } from '@/lib/time'
import { cn } from '@/lib/cn'
import { getUrgency } from '@/features/assignments/urgency'
import { useTaskStore } from '@/store/useTaskStore'

/** Tasks due on each of the next 7 days. */
export function WeekLoadCard({ now }: { now: Date }) {
  const tasks = useTaskStore((s) => s.tasks)
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(startOfDay(now), i)
    return { date, key: dateKey(date), count: 0 }
  })
  let overdue = 0
  for (const t of tasks) {
    if (t.done || !t.due) continue
    if (getUrgency(t, now) === 'overdue') overdue++
    const day = days.find((d) => d.key === t.due!.slice(0, 10))
    if (day && getUrgency(t, now) !== 'overdue') day.count++
  }
  const total = days.reduce((sum, d) => sum + d.count, 0)
  const max = Math.max(2, ...days.map((d) => d.count))

  return (
    <Card aria-label="Next 7 days">
      <CardHeader
        title="Next 7 days"
        meta={`${plural(total, 'task')} due`}
        actions={overdue > 0 ? <Pill tone="bad">{overdue} overdue</Pill> : undefined}
      />
      <div className="grid h-[100px] grid-cols-7 items-end gap-2.5" role="img" aria-label="Tasks due per day for the next seven days">
        {days.map((d, i) => (
          <div key={d.key} className="flex h-full flex-col items-center justify-end gap-1.5">
            <span className={cn('min-h-3 text-xs leading-none', i === 0 ? 'text-accent' : 'text-muted')}>{d.count || ''}</span>
            <div
              className={cn('w-full max-w-[46px] rounded-t-lg rounded-b-[3px]', i === 0 ? 'bg-accent' : 'bg-white/10')}
              style={{ height: d.count ? 12 + (d.count / max) * 52 : 4 }}
            />
            <span className={cn('text-center text-[11px] leading-tight', i === 0 ? 'text-ink' : 'text-faint')}>
              {i === 0 ? 'Today' : WEEKDAY_SHORT[d.date.getDay()]}
              <br />
              {d.date.getDate()}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
