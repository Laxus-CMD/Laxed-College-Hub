import { useRef, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import type { Task } from '@/types'
import { cn } from '@/lib/cn'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'

type Draft = Omit<Task, 'id' | 'done' | 'source'>

/**
 * Add a task where you are, as a row of the list: type a title and press Enter. Course and
 * due date are optional; the course starts as the one being shown. `defaults` lets a mode say
 * what a task added there starts as.
 */
export function TaskComposer({ courseId = '', defaults, className }: { courseId?: string; defaults?: Partial<Draft>; className?: string }) {
  const addTask = useTaskStore((s) => s.addTask)
  const courses = useScheduleStore((s) => s.courses)
  const [title, setTitle] = useState('')
  // Null follows the course being shown. An empty string is "No course", picked on purpose.
  const [picked, setPicked] = useState<string | null>(null)
  const [due, setDue] = useState('')
  const input = useRef<HTMLInputElement>(null)

  // Showing another course starts the next task there, not in a course picked for the last one.
  const [shownFor, setShownFor] = useState(courseId)
  if (shownFor !== courseId) {
    setShownFor(courseId)
    setPicked(null)
  }
  // A picked course deleted meanwhile (here or on another device) falls back to the one shown.
  const course = picked !== null && (picked === '' || courses.some((c) => c.id === picked)) ? picked : courseId

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    addTask({
      kind: 'todo',
      ...defaults,
      title: trimmed,
      courseId: course || undefined,
      due: due ? `${due}T23:59` : defaults?.due,
    })
    setTitle('')
    setDue('')
    input.current?.focus()
  }

  const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
  const field = cn('h-8 rounded-md bg-transparent px-1.5 text-[13px] text-muted transition-colors hover:bg-fill focus-visible:text-ink', ring)
  return (
    <form onSubmit={onSubmit} aria-label="Add a task" className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line py-2', className)}>
      <Plus className="size-4 shrink-0 text-faint" aria-hidden="true" />
      <input
        ref={input}
        aria-label="Task title"
        placeholder="Add a task"
        maxLength={140}
        autoComplete="off"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={cn('h-8 min-w-40 flex-1 rounded-md bg-transparent px-1 text-[14px] text-ink placeholder:text-faint', ring)}
      />
      <select aria-label="Course" value={course} onChange={(e) => setPicked(e.target.value)} className={cn(field, 'max-w-32 cursor-pointer')}>
        <option value="">No course</option>
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
          </option>
        ))}
      </select>
      <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={cn(field, 'cursor-pointer tabular-nums')} />
      <button
        type="submit"
        className={cn(
          'h-8 cursor-pointer rounded-md px-2.5 text-[13px] font-medium transition-colors',
          ring,
          title.trim() ? 'bg-accent-fill text-on-accent' : 'text-faint hover:bg-fill hover:text-muted',
        )}
      >
        Add
      </button>
    </form>
  )
}
