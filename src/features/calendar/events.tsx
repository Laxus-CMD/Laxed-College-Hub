import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDraggable } from '@dnd-kit/core'
import { Check } from 'lucide-react'
import type { ClassSession, Course, Task } from '@/types'
import { placeNear } from '@/components/ui/placeNear'
import { cn } from '@/lib/cn'
import { formatClock, formatRange, parseDateKey, toMinutes } from '@/lib/time'
import { typeLabel } from '@/features/assignments/taskType'
import { dueParts, shortDay } from './calendarModel'
import { useHoverDetails } from './eventStyle'

/** The small marker before a task's name. */
export function TaskMarker({ task, color }: { task: Task; color: string | undefined }) {
  if (task.done) {
    return (
      <span className="grid size-3 shrink-0 place-items-center rounded-full bg-fill-strong text-muted" aria-hidden="true">
        <Check className="size-2" strokeWidth={4} />
      </span>
    )
  }
  if (task.category === 'exam') return <i className="size-2 shrink-0 rotate-45 rounded-[1.5px]" style={{ background: color ?? 'var(--color-ink)' }} aria-hidden="true" />
  return <i className="size-2.5 shrink-0 rounded-full border-[1.5px]" style={{ borderColor: task.kind === 'todo' ? 'var(--color-faint)' : (color ?? 'var(--color-faint)') }} aria-hidden="true" />
}

// ── Hover details ───────────────────────────────────────────────────────────

export function HoverCard({ anchor, children }: { anchor: HTMLElement; children: ReactNode }) {
  const card = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (card.current) placeNear(card.current, anchor)
  }, [anchor, children])
  return createPortal(
    <div
      ref={card}
      role="tooltip"
      style={{ visibility: 'hidden' }}
      className="pointer-events-none fixed top-0 left-0 z-40 w-64 rounded-xl border border-line bg-raised px-3.5 py-3 text-[12.5px] text-ink shadow-pop motion-safe:animate-[fade-in_120ms_ease-out] dark:border-line-strong"
    >
      {children}
    </div>,
    document.body,
  )
}

function InfoLine({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-muted">{children}</p>
}

export function TaskInfo({ task, course }: { task: Task; course: Course | undefined }) {
  const due = dueParts(task)
  return (
    <>
      <p className={cn('font-semibold leading-snug', task.done && 'text-muted line-through')}>{task.title}</p>
      <InfoLine>
        {typeLabel(task)}
        {course ? ` · ${course.code}` : ''}
        {task.weight ? ` · ${task.weight}% of grade` : ''}
      </InfoLine>
      {due ? (
        <InfoLine>
          Due {shortDay(parseDateKey(due.date))}
          {due.time ? ` at ${formatClock(toMinutes(due.time))}` : ''}
        </InfoLine>
      ) : null}
      {task.done ? <InfoLine>Done</InfoLine> : null}
    </>
  )
}

export function ClassInfo({ session, course }: { session: ClassSession; course: Course | undefined }) {
  const place = [session.room, session.building].filter(Boolean).join(', ')
  return (
    <>
      <p className="font-semibold">{course?.code ?? 'Class'}</p>
      {course?.name ? <InfoLine>{course.name}</InfoLine> : null}
      <InfoLine>{formatRange(session.start, session.end)}</InfoLine>
      {place ? <InfoLine>{place}</InfoLine> : null}
      {course?.professor ? <InfoLine>{course.professor}</InfoLine> : null}
    </>
  )
}

// ── Tasks that can be dragged to another day or time ───────────────────────

/** A task's button, draggable to reschedule it. A plain click still opens it. */
export function DraggableTask({
  task,
  course,
  label,
  className,
  style,
  onOpen,
  children,
}: {
  task: Task
  course: Course | undefined
  label: string
  className?: string
  style?: CSSProperties
  onOpen: (el: HTMLElement) => void
  children: ReactNode
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `task:${task.id}`, data: { taskId: task.id } })
  const hover = useHoverDetails(() => <TaskInfo task={task} course={course} />)
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      onPointerDown={hover.onPointerDown}
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={label}
      aria-roledescription="task"
      className={cn('cursor-pointer touch-manipulation transition-[opacity,filter] hover:brightness-[0.97] dark:hover:brightness-110', isDragging && 'opacity-40', className)}
      style={style}
    >
      {children}
    </button>
  )
}
