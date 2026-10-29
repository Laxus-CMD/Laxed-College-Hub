import { Trash2 } from 'lucide-react'
import type { Course, Task } from '@/types'
import { CheckButton } from '@/components/ui/CheckButton'
import { CourseChip } from '@/components/ui/Chip'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { dueLabel, type DueTone } from '@/features/assignments/urgency'
import { deleteTask } from '@/store/actions'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

const TONE: Record<DueTone, string> = {
  bad: 'text-bad',
  warn: 'text-warn',
  normal: 'text-muted',
  faint: 'text-faint',
}

interface TaskRowProps {
  task: Task
  now: Date
  course?: Course
  /** The full list view adds a meta line and a delete button. */
  full?: boolean
}

export function TaskRow({ task, now, course, full = false }: TaskRowProps) {
  const toggle = useTaskStore((s) => s.toggleTask)
  const openDialog = useUiStore((s) => s.openDialog)
  const flash = useUiStore((s) => s.flashTaskId === task.id)
  const due = dueLabel(task, now)

  const meta = [
    task.kind === 'assignment' ? 'Assignment' : 'To-do',
    task.weight ? `${task.weight}% of grade` : null,
    task.source === 'ics' ? 'From Canvas' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <li
      data-task-id={task.id}
      className={cn(
        'grid items-center gap-x-3 gap-y-1 border-t border-line py-2.5 first:border-t-0 max-sm:grid-cols-[auto_minmax(0,1fr)_auto]',
        full ? 'grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] py-3' : 'grid-cols-[auto_minmax(0,1fr)_auto_auto]',
        flash && 'animate-[flash_1.6s_ease-out]',
      )}
    >
      <CheckButton
        checked={task.done}
        onChange={() => toggle(task.id)}
        label={`${task.done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
      />
      <button
        type="button"
        onClick={() => openDialog({ type: 'task', id: task.id })}
        className={cn(
          'min-w-0 cursor-pointer py-0.5 text-left hover:text-accent',
          full ? 'whitespace-normal' : 'truncate',
          task.done && 'text-faint line-through hover:text-muted',
        )}
      >
        <span className={cn(!full && 'block truncate')}>{task.title}</span>
        {full ? <span className="mt-0.5 block text-xs text-faint no-underline">{meta}</span> : null}
      </button>
      <span className="max-sm:col-start-2 max-sm:justify-self-start">{course ? <CourseChip course={course} /> : null}</span>
      <span className={cn('min-w-[7.5rem] text-right text-xs whitespace-nowrap max-sm:col-start-3 max-sm:row-start-1 max-sm:min-w-0', TONE[due.tone])}>
        {due.text}
      </span>
      {full ? (
        <IconButton label={`Delete ${task.title}`} onClick={() => deleteTask(task.id)} className="max-sm:col-start-3 max-sm:row-start-2">
          <Trash2 className="size-4" aria-hidden="true" />
        </IconButton>
      ) : null}
    </li>
  )
}
