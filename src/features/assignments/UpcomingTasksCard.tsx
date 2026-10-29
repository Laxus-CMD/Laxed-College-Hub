import { Plus } from 'lucide-react'
import { Card, CardHeader, EmptyNote } from '@/components/ui/Card'
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
    <Card aria-label="Tasks">
      <CardHeader
        title="Tasks"
        meta={`${open.length} open`}
        actions={
          <IconButton label="Add task" onClick={() => openDialog({ type: 'task' })}>
            <Plus className="size-[18px]" aria-hidden="true" />
          </IconButton>
        }
      />
      {open.length > 0 ? (
        <ul>
          {open.slice(0, LIMIT).map((t) => (
            <TaskRow key={t.id} task={t} now={now} course={courses.get(t.courseId ?? '')} />
          ))}
        </ul>
      ) : (
        <EmptyNote>All clear. Add a task with the plus button.</EmptyNote>
      )}
      <div className="mt-3 border-t border-line pt-3">
        <button type="button" onClick={() => navigate('assignments')} className="cursor-pointer text-[13px] text-accent hover:underline">
          {open.length > LIMIT ? `See all ${open.length} tasks` : 'Open Tasks & Assignments'}
        </button>
      </div>
    </Card>
  )
}
