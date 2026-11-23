import { Plus, X } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { useNow } from '@/lib/useNow'
import { UpcomingTasksCard } from '@/features/assignments/UpcomingTasksCard'
import { WeekLoadCard } from '@/features/assignments/WeekLoadCard'
import { GpaCard } from '@/features/grades/GpaCard'
import { HeroBanner } from '@/features/hero/HeroBanner'
import { getHeroState } from '@/features/hero/heroState'
import { RecentNotesCard } from '@/features/notes/RecentNotesCard'
import { PomodoroCard } from '@/features/pomodoro/PomodoroCard'
import { TodayCard } from '@/features/schedule/TodayCard'
import { clearAllData } from '@/store/actions'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

function greeting(now: Date): string {
  const h = now.getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function OverviewPage() {
  const now = useNow()
  const sessions = useScheduleStore((s) => s.sessions)
  const tasks = useTaskStore((s) => s.tasks)
  const name = useSettingsStore((s) => s.name)
  const isDemo = useSettingsStore((s) => s.isDemo)
  const dismissed = useSettingsStore((s) => s.bannerDismissed)
  const dismiss = useSettingsStore((s) => s.dismissBanner)
  const openDialog = useUiStore((s) => s.openDialog)

  const hero = getHeroState(now, sessions, tasks)

  return (
    <>
      <PageHeader
        title={`${greeting(now)}${name ? `, ${name}` : ''}`}
        subtitle={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <Button variant="primary" onClick={() => openDialog({ type: 'task' })}>
            <Plus className="size-4" aria-hidden="true" />
            New task
          </Button>
        }
      />
      {isDemo && !dismissed ? (
        <div className="mb-6 flex flex-wrap items-center gap-3.5 rounded-2xl border border-line bg-surface py-3 pr-3 pl-5 shadow-card">
          <p className="min-w-56 flex-1 text-[13.5px] text-muted">You are looking at sample data. Replace it with your own courses, classes and tasks.</p>
          <Button size="sm" variant="primary" onClick={clearAllData}>
            Clear sample data
          </Button>
          <IconButton label="Dismiss" onClick={dismiss}>
            <X className="size-[18px]" aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <div className="flex min-w-0 flex-col gap-5 xl:gap-6">
          <HeroBanner state={hero} now={now} />
          <UpcomingTasksCard now={now} />
          <WeekLoadCard now={now} />
        </div>
        <div className="grid min-w-0 items-start gap-5 max-xl:grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] xl:flex xl:flex-col xl:items-stretch xl:gap-6">
          <PomodoroCard />
          <TodayCard now={now} />
          <GpaCard />
          <RecentNotesCard />
        </div>
      </div>
    </>
  )
}
