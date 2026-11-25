import { useId, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Urgency } from '@/types'
import { cn } from '@/lib/cn'
import { TaskRow } from '@/features/assignments/TaskRow'
import { groupByUrgency, URGENCY_LABEL, URGENCY_ORDER } from '@/features/assignments/urgency'
import { TaskComposer } from '@/features/assignments/workspace/TaskComposer'
import { useWorkspace } from '@/features/assignments/workspace/useWorkspace'
import { useUiStore } from '@/store/useUiStore'
import { readCollapsed, writeCollapsed } from './collapse'

/** Finished tasks read as a record, not as a deadline. */
const LABEL: Record<Urgency, string> = { ...URGENCY_LABEL, done: 'Completed' }

/** The checklist: every task, grouped by when it is due, most pressing first. */
export default function ClassicMode() {
  const { now, all, tasks, courseOf, courseId, courses } = useWorkspace()
  const flashId = useUiStore((s) => s.flashTaskId)
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const groups = groupByUrgency(tasks, now)
  const shown = URGENCY_ORDER.filter((u) => groups[u].length > 0)
  const open = tasks.length - groups.done.length

  // A task opened from elsewhere unfolds its group, once per opening. The workspace scrolls to
  // it. Not saved: the student's own folding is what this browser remembers.
  const [revealed, setRevealed] = useState<string | null>(null)
  if (flashId !== revealed) {
    setRevealed(flashId)
    const u = flashId ? URGENCY_ORDER.find((g) => groups[g].some((t) => t.id === flashId)) : undefined
    if (u && collapsed.includes(u)) setCollapsed(collapsed.filter((x) => x !== u))
  }

  const toggle = (u: Urgency) => {
    const next = collapsed.includes(u) ? collapsed.filter((x) => x !== u) : [...collapsed, u]
    setCollapsed(next)
    writeCollapsed(next)
  }

  const course = courses.find((c) => c.id === courseId)
  const empty = tasks.length
    ? 'Everything here is done.'
    : course
      ? `No tasks for ${course.code}.${all.length ? ' Choose All courses to see the rest.' : ''}`
      : 'No tasks yet. Add one above, or import your Canvas deadlines.'

  return (
    <div className="max-w-4xl">
      <TaskComposer courseId={courseId} />
      {open === 0 ? <p className="py-6 text-[14px] text-muted">{empty}</p> : null}
      {shown.map((u) => (
        <Group key={u} urgency={u} label={LABEL[u]} count={groups[u].length} folded={collapsed.includes(u)} onToggle={() => toggle(u)}>
          {groups[u].map((t) => (
            <TaskRow key={t.id} task={t} now={now} course={courseOf(t)} full />
          ))}
        </Group>
      ))}
    </div>
  )
}

function Group({
  urgency,
  label,
  count,
  folded,
  onToggle,
  children,
}: {
  urgency: Urgency
  label: string
  count: number
  folded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-label={label} className="mt-6 first-of-type:mt-5">
      <h2>
        <button
          type="button"
          aria-expanded={!folded}
          aria-controls={folded ? undefined : id}
          onClick={onToggle}
          className={cn(
            '-ml-1 flex cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-[13px] font-semibold tracking-[-0.005em] text-muted transition-colors hover:text-ink',
            urgency === 'overdue' && 'text-bad hover:text-bad',
            urgency === 'today' && 'text-warn hover:text-warn',
          )}
        >
          <ChevronRight className={cn('size-3.5 transition-transform duration-200 ease-(--ease-apple)', !folded && 'rotate-90')} aria-hidden="true" />
          {label}
          <span className="font-normal text-faint tabular-nums">{count}</span>
        </button>
      </h2>
      {folded ? null : (
        <ul id={id} className="@container mt-1 divide-y divide-line/60">
          {children}
        </ul>
      )}
    </section>
  )
}
