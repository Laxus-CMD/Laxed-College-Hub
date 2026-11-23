import { ChevronRight, Plus } from 'lucide-react'
import { Card, EmptyNote } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/Button'
import { navigate } from '@/lib/route'
import { compareTasks } from '@/features/assignments/urgency'
import { TaskRow } from '@/features/assignments/TaskRow'
import { useCourseMap } from '@/store/selectors'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

const LIMIT = 6

export function UpcomingTasksCard({ now }: { now: Date }) {
  const tasks = useTaskStore((s) => s.tasks)
  const courses = useCourseMap()
  const openDialog = useUiStore((s) => s.openDialog)
  const open = tasks.filter((t) => !t.done).sort(compareTasks)

  return (
    // A column, so the footer stays at the bottom when the dashboard gives this card extra height.
    <Card aria-label="Tasks" className="flex flex-col">
      <div className="mb-3 flex min-h-8 items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">Tasks</h3>
        <span className="rounded-full bg-fill px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{open.length} open</span>
        <IconButton label="Add task" onClick={() => openDialog({ type: 'task' })} className="ml-auto bg-fill hover:bg-fill-strong">
          <Plus className="size-[18px]" aria-hidden="true" />
        </IconButton>
      </div>
      {open.length > 0 ? (
        <ul className="@container flex flex-col gap-px">
          {open.slice(0, LIMIT).map((t) => (
            <TaskRow key={t.id} task={t} now={now} course={courses.get(t.courseId ?? '')} />
          ))}
        </ul>
      ) : (
        <EmptyNote>All clear. Add a task with the plus button.</EmptyNote>
      )}
      <div className="mt-auto pt-3">
        <div className="mb-1 h-px bg-line" />
        <button
          type="button"
          onClick={() => navigate('assignments')}
          className="group -mx-2 flex min-h-11 w-[calc(100%+1rem)] cursor-pointer items-center justify-between rounded-xl px-2 text-[13px] font-medium text-accent transition-colors hover:bg-fill"
        >
          {open.length > LIMIT ? `See all ${open.length} tasks` : 'Open Tasks & Assignments'}
          <ChevronRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </div>
    </Card>
  )
}
