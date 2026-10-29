import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CourseChip } from '@/components/ui/Chip'
import { PageHeader } from '@/components/ui/PageHeader'
import { addDays, formatShortDate, plural, startOfWeek } from '@/lib/time'
import { useNow } from '@/lib/useNow'
import { weeklyMinutes } from '@/features/schedule/scheduleUtils'
import { WeeklyGrid } from '@/features/schedule/WeeklyGrid'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

export default function SchedulePage() {
  const now = useNow()
  const sessions = useScheduleStore((s) => s.sessions)
  const courses = useScheduleStore((s) => s.courses)
  const openDialog = useUiStore((s) => s.openDialog)
  const monday = startOfWeek(now)
  const hours = Math.round((weeklyMinutes(sessions) / 60) * 10) / 10
  const meetings = sessions.reduce((n, s) => n + s.days.length, 0)
  const used = courses.filter((c) => sessions.some((s) => s.courseId === c.id))

  return (
    <>
      <PageHeader
        title="Weekly Schedule"
        subtitle={`${formatShortDate(monday)} to ${formatShortDate(addDays(monday, 6))}, ${plural(meetings, 'meeting')}, ${hours} hours a week`}
        actions={
          <Button variant="primary" onClick={() => openDialog({ type: 'session' })}>
            <Plus className="size-4" aria-hidden="true" />
            Add class
          </Button>
        }
      />
      {used.length > 0 ? (
        <div className="mb-3.5 flex flex-wrap gap-2" aria-label="Course colors">
          {used.map((c) => (
            <CourseChip key={c.id} course={c} />
          ))}
        </div>
      ) : null}
      <WeeklyGrid now={now} />
      <p className="mt-3 text-[13px] text-faint">Click an empty slot to add a class. Click a class to see its details and notes.</p>
    </>
  )
}
