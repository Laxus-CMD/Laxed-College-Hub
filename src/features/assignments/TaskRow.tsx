import { Trash2 } from 'lucide-react'
import type { Course, Task } from '@/types'
import { CheckButton } from '@/components/ui/CheckButton'
import { CourseChip } from '@/components/ui/Chip'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { dueLabel, DUE_TONE_CLASS as TONE } from '@/features/assignments/urgency'
import { deleteTask } from '@/store/actions'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { typeLabel } from '@/features/assignments/taskType'

interface TaskRowProps {
  task: Task
  now: Date
  course?: Course
  /** The full list view adds a meta line and a delete button. */
  full?: boolean
}

/**
 * One task, as a flat row. Lay it out inside a list marked `@container`: it puts the
 * course and due date on a second line when the list is narrow, whatever the window size.
 */
export function TaskRow({ task, now, course, full = false }: TaskRowProps) {
  const toggle = useTaskStore((s) => s.toggleTask)
  const openDialog = useUiStore((s) => s.openDialog)
  const flash = useUiStore((s) => s.flashTaskId === task.id)
  const due = dueLabel(task, now)

  const meta = [
    typeLabel(task),
    !task.done && task.progress === 'started' ? 'In progress' : null,
    task.weight ? `${task.weight}% of grade` : null,
    task.source === 'ics' ? 'From Canvas' : null,
  ]
    .filter(Boolean)
    .join(full ? ' · ' : ', ')

  return (
    <li
      data-task-id={task.id}
      className={cn(
        'group grid items-center gap-x-3 gap-y-0.5 transition-colors duration-150',
        // The list view is flat: rows sit on hairlines. The compact card version keeps its soft hover.
        full ? 'px-1 py-2.5 hover:bg-fill/50' : '-mx-2 rounded-xl px-2 py-2 hover:bg-fill',
        'grid-cols-[auto_minmax(0,1fr)_auto]',
        // The due column fits its longest label and keeps short ones aligned.
        full ? '@lg:grid-cols-[auto_minmax(0,1fr)_minmax(6rem,auto)_minmax(5.5rem,auto)_auto]' : '@lg:grid-cols-[auto_minmax(0,1fr)_auto_minmax(5.5rem,auto)]',
        flash && 'animate-[flash_1.6s_ease-out]',
      )}
    >
      <span className="col-start-1 row-start-1 grid">
      <CheckButton
        checked={task.done}
        onChange={() => toggle(task.id)}
        label={`${task.done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
      />
      </span>
      <button
        type="button"
        onClick={() => openDialog({ type: 'task', id: task.id })}
        className={cn(
          'col-start-2 row-start-1 min-w-0 cursor-pointer rounded-md py-1 text-left text-[14px] font-medium text-ink transition-colors',
          task.done && 'font-normal text-faint line-through',
        )}
      >
        <span className={cn('block', full ? 'whitespace-normal' : 'truncate')}>{task.title}</span>
        {full ? <span className="mt-0.5 block text-xs font-normal text-faint">{meta}</span> : null}
      </button>
      {/* Every cell has a fixed place, so grid auto-placement can never reorder them. */}
      <span className="col-start-2 row-start-2 justify-self-start @lg:col-start-3 @lg:row-start-1 @lg:justify-self-end">
        {course ? full ? <CourseLabel course={course} /> : <CourseChip course={course} /> : null}
      </span>
      <span className={cn('col-start-3 row-start-1 text-right text-xs whitespace-nowrap tabular-nums @lg:col-start-4', TONE[due.tone])}>
        {due.text}
      </span>
      {full ? (
        <IconButton
          label={`Delete ${task.title}`}
          onClick={() => deleteTask(task.id)}
          className="col-start-3 row-start-2 justify-self-end opacity-60 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 @lg:col-start-5 @lg:row-start-1"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </IconButton>
      ) : null}
    </li>
  )
}

/** The course as quiet text with its color, for the flat list. */
function CourseLabel({ course }: { course: Course }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted">
      <i className="size-1.5 shrink-0 rounded-full" style={{ background: course.color }} aria-hidden="true" />
      {course.code}
    </span>
  )
}
