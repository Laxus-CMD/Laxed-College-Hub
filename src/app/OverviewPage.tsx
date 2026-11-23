import { useRef, useState } from 'react'
import { Plus, SlidersHorizontal, X } from 'lucide-react'
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
import { CustomizableDashboard } from '@/features/dashboard/CustomizableDashboard'
import { DashboardEditBar } from '@/features/dashboard/DashboardEditBar'
import { readingOrder, setHidden, type WidgetId } from '@/features/dashboard/layout'
import { useDashboardLayout } from '@/features/dashboard/useDashboardLayout'
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
  const showToast = useUiStore((s) => s.showToast)
  const { layout, save, reset } = useDashboardLayout()
  const [editing, setEditing] = useState(false)
  const customize = useRef<HTMLButtonElement>(null)

  /** The widgets, by id. Where each goes is decided by the saved layout, not here. */
  const widgets: Record<WidgetId, React.ReactNode> = {
    'next-class': <HeroBanner state={hero} now={now} />,
    tasks: <UpcomingTasksCard now={now} />,
    today: <TodayCard now={now} />,
    pomodoro: <PomodoroCard />,
    'next-7-days': <WeekLoadCard now={now} />,
    'term-gpa': <GpaCard />,
    'recent-notes': <RecentNotesCard />,
  }
  const finish = () => {
    setEditing(false)
    // Back to the button that started it.
    requestAnimationFrame(() => customize.current?.focus())
  }

  return (
    <>
      <PageHeader
        title={`${greeting(now)}${name ? `, ${name}` : ''}`}
        subtitle={now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        actions={
          <>
            {editing ? null : (
              <Button ref={customize} variant="subtle" onClick={() => setEditing(true)}>
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                Customize
              </Button>
            )}
            <Button variant="primary" onClick={() => openDialog({ type: 'task' })}>
              <Plus className="size-4" aria-hidden="true" />
              New task
            </Button>
          </>
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
      {editing ? (
        <DashboardEditBar
          layout={layout}
          onToggle={(id, hide) => save(setHidden(layout, id, hide))}
          onReset={() => {
            reset()
            showToast({ message: 'Dashboard reset to the default layout. Your data is unchanged.' })
          }}
          onDone={finish}
        />
      ) : null}
      {/* The default order follows importance: what is happening now and what is due, then the tools used alongside, then the rest. */}
      <CustomizableDashboard layout={layout} editing={editing} widgets={widgets} onChange={save} />
      {!editing && readingOrder(layout).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="text-[15px] font-medium">All widgets are hidden</p>
          <p className="mt-1 text-[13px] text-muted">Nothing was deleted. Choose which ones to show again.</p>
          <Button className="mt-4" onClick={() => setEditing(true)}>
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            Customize
          </Button>
        </div>
      ) : null}
    </>
  )
}
