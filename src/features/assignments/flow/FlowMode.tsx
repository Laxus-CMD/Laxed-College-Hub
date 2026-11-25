import { memo, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Check, Play, RotateCcw, Undo2 } from 'lucide-react'
import type { Course, Task } from '@/types'
import { cn } from '@/lib/cn'
import { IconButton } from '@/components/ui/Button'
import { typeLabel } from '@/features/assignments/taskType'
import { compareTasks, DUE_TONE_CLASS, dueLabel } from '@/features/assignments/urgency'
import { STAGES, stageLabel, stageOf, type Stage } from '@/lib/stage'
import { TaskComposer } from '@/features/assignments/workspace/TaskComposer'
import { useWorkspace } from '@/features/assignments/workspace/useWorkspace'
import { moveTaskToStage } from '@/store/actions'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

/** Completed work grows without end; the board shows the most recent until asked. */
const COMPLETED_SHOWN = 12

const isStage = (v: unknown): v is Stage => STAGES.some((s) => s.id === v)

/** Latest due first, with undated work after everything dated. */
const byRecentDue = (a: Task, b: Task) => (!a.due !== !b.due ? (a.due ? -1 : 1) : compareTasks(b, a))

/** Buckets and orders the board. Depends only on the tasks, not the clock, so a minute tick reuses it. */
function bucket(tasks: Task[]): Record<Stage, Task[]> {
  const columns: Record<Stage, Task[]> = { 'not-started': [], 'in-progress': [], completed: [] }
  for (const t of tasks) columns[stageOf(t)].push(t)
  columns['not-started'].sort(compareTasks)
  columns['in-progress'].sort(compareTasks)
  columns.completed.sort(byRecentDue)
  return columns
}

/**
 * Moves a task and keeps the keyboard where it was: on the same card, now in its new column.
 * The card is a new element there, so focus follows it after the board has re-rendered.
 */
function moveAndFollow(taskId: string, stage: Stage) {
  moveTaskToStage(taskId, stage)
  // A finished task can land past the Completed cap; showing it the way search does reveals it.
  if (stage === 'completed') useUiStore.getState().flashTask(taskId)
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-task-id="${taskId}"] [data-card-title]`)?.focus())
}
const titleOf = (id: unknown) => useTaskStore.getState().tasks.find((t) => t.id === id)?.title ?? 'Task'

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
  onDragOver: ({ active, over }) => (over && isStage(over.id) ? `${titleOf(active.id)} is over ${stageLabel(over.id)}.` : `${titleOf(active.id)} is not over a column.`),
  onDragEnd: ({ active, over }) => (over && isStage(over.id) ? `${titleOf(active.id)} was moved to ${stageLabel(over.id)}.` : `${titleOf(active.id)} was not moved.`),
  onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
}

/**
 * Work that takes more than one sitting: start it, keep it in view while it is in progress, and
 * finish it. Drag a card between columns, or use its buttons, which also work from the keyboard.
 */
export default function FlowMode() {
  const { now, tasks, courseOf, courseId } = useWorkspace()
  const flashId = useUiStore((s) => s.flashTaskId)
  const [allDone, setAllDone] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )

  const columns = useMemo(() => bucket(tasks), [tasks])

  // A completed task opened from elsewhere is shown even if it is past the first few.
  const [revealed, setRevealed] = useState<string | null>(null)
  if (flashId !== revealed) {
    setRevealed(flashId)
    if (columns.completed.findIndex((t) => t.id === flashId) >= COMPLETED_SHOWN) setAllDone(true)
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null)
    if (over && isStage(over.id)) moveTaskToStage(String(active.id), over.id)
  }
  const draggingTask = dragging ? tasks.find((t) => t.id === dragging) : undefined

  return (
    <div>
      <TaskComposer courseId={courseId} className="max-w-4xl" />
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragging(String(active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
        accessibility={{ announcements }}
      >
        <p className="sr-only">Drag a task to another column, or use the Start, Complete and Reopen buttons on each task.</p>
        <div className="mt-5 grid items-start gap-x-6 gap-y-8 md:grid-cols-3">
          {STAGES.map(({ id, label }) => {
            const list = id === 'completed' && !allDone ? columns.completed.slice(0, COMPLETED_SHOWN) : columns[id]
            const hidden = columns[id].length - list.length
            return (
              <Column key={id} stage={id} label={label} count={columns[id].length}>
                {list.map((t) => (
                  <Card key={t.id} task={t} now={now} course={courseOf(t)} dragging={dragging === t.id} />
                ))}
                {hidden > 0 ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => setAllDone(true)}
                      className="cursor-pointer rounded-md px-1 py-1 text-[13px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      Show {hidden} more
                    </button>
                  </li>
                ) : null}
              </Column>
            )
          })}
        </div>
        <DragOverlay dropAnimation={null}>{draggingTask ? <CardBody task={draggingTask} now={now} course={courseOf(draggingTask)} lifted /> : null}</DragOverlay>
      </DndContext>
    </div>
  )
}

const EMPTY: Record<Stage, string> = {
  'not-started': 'Nothing waiting.',
  'in-progress': 'Start a task to keep it here while you work on it.',
  completed: 'Finished work shows up here.',
}

function Column({ stage, label, count, children }: { stage: Stage; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  return (
    <section aria-label={label} className="min-w-0">
      <h2 className="mb-2 flex items-baseline gap-1.5 text-[13px] font-semibold tracking-[-0.005em] text-muted">
        {label}
        <span className="font-normal text-faint tabular-nums">{count}</span>
      </h2>
      <ul ref={setNodeRef} className={cn('-mx-1.5 flex min-h-24 flex-col gap-2 rounded-lg p-1.5 transition-colors duration-150', isOver && 'bg-fill')}>
        {children}
        {count === 0 ? <li className="px-1 py-2 text-[13px] text-faint">{EMPTY[stage]}</li> : null}
      </ul>
    </section>
  )
}

const Card = memo(function Card({ task, now, course, dragging }: { task: Task; now: Date; course?: Course; dragging: boolean }) {
  const { setNodeRef, listeners } = useDraggable({ id: task.id })
  const flash = useUiStore((s) => s.flashTaskId === task.id)
  return (
    <li ref={setNodeRef} {...listeners} data-task-id={task.id} className={cn('touch-manipulation', dragging && 'opacity-40', flash && 'animate-[flash_1.6s_ease-out]')}>
      <CardBody task={task} now={now} course={course} />
    </li>
  )
})

/** The card's face, shared by the board and the copy that follows the pointer while dragging. */
function CardBody({ task, now, course, lifted = false }: { task: Task; now: Date; course?: Course; lifted?: boolean }) {
  const openDialog = useUiStore((s) => s.openDialog)
  const stage = stageOf(task)
  const due = dueLabel(task, now)
  const meta = [typeLabel(task), task.weight ? `${task.weight}%` : null].filter(Boolean).join(' · ')
  return (
    <div
      className={cn(
        'group cursor-grab rounded-lg border border-line bg-surface px-3 py-2.5 transition-colors duration-150 hover:border-line-strong active:cursor-grabbing',
        lifted && 'cursor-grabbing border-line-strong shadow-pop',
      )}
    >
      <button
        type="button"
        data-card-title
        onClick={() => openDialog({ type: 'task', id: task.id })}
        className={cn(
          'block w-full cursor-pointer rounded-sm text-left text-[14px] leading-snug font-medium text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
          stage === 'completed' && 'font-normal text-faint line-through',
        )}
      >
        {task.title}
      </button>
      <div className="mt-1.5 flex items-center gap-x-3 gap-y-1 text-xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5">
          {course ? (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
              <i className="size-1.5 shrink-0 rounded-full" style={{ background: course.color }} aria-hidden="true" />
              {course.code}
            </span>
          ) : null}
          {stage !== 'completed' ? <span className={cn('whitespace-nowrap tabular-nums', DUE_TONE_CLASS[due.tone])}>{due.text}</span> : null}
          <span className="whitespace-nowrap text-faint">{meta}</span>
        </div>
        {lifted ? null : <Actions task={task} stage={stage} />}
      </div>
    </div>
  )
}

/** Contextual moves: quiet until the card is hovered or focused, always reachable by keyboard. */
function Actions({ task, stage }: { task: Task; stage: Stage }) {
  const move = (to: Stage) => moveAndFollow(task.id, to)
  // Quiet until hovered; always full strength where there is no hover (touch screens).
  const quiet = 'size-7 opacity-60 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
  return (
    // Pressing a button never starts a drag.
    <span className="flex shrink-0 items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
      {stage === 'not-started' ? (
        <IconButton label={`Start ${task.title}`} onClick={() => move('in-progress')} className={quiet}>
          <Play className="size-3.5" aria-hidden="true" />
        </IconButton>
      ) : null}
      {stage === 'in-progress' ? (
        <>
          <IconButton label={`Move ${task.title} back to Not started`} onClick={() => move('not-started')} className={quiet}>
            <Undo2 className="size-3.5" aria-hidden="true" />
          </IconButton>
          <IconButton label={`Complete ${task.title}`} onClick={() => move('completed')} className={quiet}>
            <Check className="size-3.5" aria-hidden="true" />
          </IconButton>
        </>
      ) : null}
      {stage === 'completed' ? (
        <IconButton label={`Reopen ${task.title}`} onClick={() => move(task.progress === 'started' ? 'in-progress' : 'not-started')} className={quiet}>
          <RotateCcw className="size-3.5" aria-hidden="true" />
        </IconButton>
      ) : null}
    </span>
  )
}
