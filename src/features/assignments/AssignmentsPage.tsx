import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Plus, Upload } from 'lucide-react'
import type { Urgency } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Dot } from '@/components/ui/Chip'
import { Input, Select } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { FilterChip, SegmentedTabs } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'
import { TaskRow } from '@/features/assignments/TaskRow'
import { getUrgency, groupByUrgency, URGENCY_LABEL } from '@/features/assignments/urgency'
import { useCourseMap } from '@/store/selectors'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

type Tab = 'open' | 'today' | 'week' | 'overdue' | 'done'

const TAB_LABEL: Record<Tab, string> = {
  open: 'Open',
  today: 'Due today',
  week: 'This week',
  overdue: 'Overdue',
  done: 'Done',
}

const TAB_GROUPS: Record<Tab, Urgency[]> = {
  open: ['overdue', 'today', 'this-week', 'later', 'no-date'],
  today: ['today'],
  week: ['this-week'],
  overdue: ['overdue'],
  done: ['done'],
}

const EMPTY: Record<Tab, string> = {
  open: 'No open tasks. Add one above.',
  today: 'Nothing due today.',
  week: 'Nothing due in the next 7 days.',
  overdue: 'Nothing overdue. Nice.',
  done: 'No finished tasks yet.',
}

export default function AssignmentsPage() {
  const now = useNow()
  const tasks = useTaskStore((s) => s.tasks)
  const addTask = useTaskStore((s) => s.addTask)
  const courses = useScheduleStore((s) => s.courses)
  const courseMap = useCourseMap()
  const taskCourse = useUiStore((s) => s.taskCourse)
  const setTaskCourse = useUiStore((s) => s.setTaskCourse)
  const openDialog = useUiStore((s) => s.openDialog)
  const flashId = useUiStore((s) => s.flashTaskId)
  const flashTask = useUiStore((s) => s.flashTask)

  const [tab, setTab] = useState<Tab>(() => {
    const id = useUiStore.getState().flashTaskId
    return id && useTaskStore.getState().tasks.find((t) => t.id === id)?.done ? 'done' : 'open'
  })
  const [title, setTitle] = useState('')
  const [quickCourse, setQuickCourse] = useState('')
  const [quickDue, setQuickDue] = useState('')
  const titleInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!flashId) return
    document.querySelector(`[data-task-id="${flashId}"]`)?.scrollIntoView?.({ block: 'center' })
    const timer = setTimeout(() => flashTask(null), 1800)
    return () => clearTimeout(timer)
  }, [flashId, flashTask])

  const pool = tasks.filter((t) => !taskCourse || t.courseId === taskCourse)
  const urgencyOf = (t: (typeof tasks)[number]) => getUrgency(t, now)
  const counts: Record<Tab, number> = {
    open: pool.filter((t) => urgencyOf(t) !== 'done').length,
    today: pool.filter((t) => urgencyOf(t) === 'today').length,
    week: pool.filter((t) => urgencyOf(t) === 'this-week').length,
    overdue: pool.filter((t) => urgencyOf(t) === 'overdue').length,
    done: pool.filter((t) => urgencyOf(t) === 'done').length,
  }
  const groups = groupByUrgency(pool, now)
  const shown = TAB_GROUPS[tab].filter((u) => groups[u].length > 0)

  const doneAll = tasks.filter((t) => t.done).length
  const percent = tasks.length ? Math.round((doneAll / tasks.length) * 100) : 0

  const onQuickAdd = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    addTask({
      kind: 'todo',
      title: trimmed,
      courseId: quickCourse || taskCourse || undefined,
      due: quickDue ? `${quickDue}T23:59` : undefined,
    })
    setTitle('')
    setQuickDue('')
    titleInput.current?.focus()
  }

  return (
    <>
      <PageHeader
        title="Tasks & Assignments"
        subtitle={`${tasks.length - doneAll} open, ${doneAll} done`}
        actions={
          <>
            <Button onClick={() => openDialog({ type: 'ics' })}>
              <Upload className="size-4" aria-hidden="true" />
              Import from Canvas
            </Button>
            <Button onClick={() => openDialog({ type: 'task', courseId: taskCourse || undefined })}>
              <Plus className="size-4" aria-hidden="true" />
              New task with details
            </Button>
          </>
        }
      >
        <div
          className="mt-2.5 h-1.5 w-56 overflow-hidden rounded-full bg-white/8"
          role="img"
          aria-label={`${percent} percent of tasks done`}
        >
          <i className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </PageHeader>

      <form
        onSubmit={onQuickAdd}
        aria-label="Add a task"
        className="mb-4 grid gap-2.5 rounded-2xl border border-line bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_190px_150px_auto] max-sm:grid-cols-2"
      >
        <Input
          ref={titleInput}
          aria-label="Task title"
          placeholder="Add a task and press Enter"
          maxLength={140}
          autoComplete="off"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="max-sm:col-span-2"
        />
        <Select aria-label="Course" value={quickCourse} onChange={(e) => setQuickCourse(e.target.value)}>
          <option value="">No course</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}
            </option>
          ))}
        </Select>
        <Input aria-label="Due date" type="date" value={quickDue} onChange={(e) => setQuickDue(e.target.value)} />
        <Button type="submit" variant="primary" className="max-sm:col-span-2">
          Add
        </Button>
      </form>

      <SegmentedTabs
        label="Task filter"
        value={tab}
        onChange={setTab}
        options={(Object.keys(TAB_LABEL) as Tab[]).map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] }))}
      />

      {courses.length > 0 ? (
        <div className="mt-3.5 flex flex-wrap gap-2" role="group" aria-label="Filter by course">
          <FilterChip pressed={!taskCourse} onClick={() => setTaskCourse('')}>
            All courses
          </FilterChip>
          {courses.map((c) => (
            <FilterChip key={c.id} pressed={taskCourse === c.id} onClick={() => setTaskCourse(taskCourse === c.id ? '' : c.id)}>
              <Dot color={c.color} />
              {c.code}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {shown.length > 0 ? (
        shown.map((u) => (
          <section key={u} aria-label={URGENCY_LABEL[u]} className="mt-5">
            <h2
              className={cn(
                'mb-1 flex items-center gap-2 text-[13px] font-medium text-muted',
                u === 'overdue' && 'text-bad',
                u === 'today' && 'text-warn',
              )}
            >
              {URGENCY_LABEL[u]}
              <span className="text-[11px] font-normal text-faint">{groups[u].length}</span>
            </h2>
            <Card className="px-[18px] py-1.5">
              <ul>
                {groups[u].map((t) => (
                  <TaskRow key={t.id} task={t} now={now} course={courseMap.get(t.courseId ?? '')} full />
                ))}
              </ul>
            </Card>
          </section>
        ))
      ) : (
        <Card className="mt-5">
          <p className="text-muted">{EMPTY[tab]}</p>
        </Card>
      )}
    </>
  )
}
