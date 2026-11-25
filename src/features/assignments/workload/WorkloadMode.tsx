import { useEffect, useMemo, useState } from 'react'
import type { Course, Task } from '@/types'
import { cn } from '@/lib/cn'
import { formatDuration, plural, WEEKDAY_SHORT } from '@/lib/time'
import { CheckButton } from '@/components/ui/CheckButton'
import { SegmentedTabs } from '@/components/ui/Tabs'
import { ESTIMATES, estimateLabel, estimateShort } from '@/features/assignments/estimate'
import { dueLabel, DUE_TONE_CLASS } from '@/features/assignments/urgency'
import { useWorkspace } from '@/features/assignments/workspace/useWorkspace'
import { useCanStore } from '@/sync/useSyncStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { heaviestDays, valueOf, workload, type CourseLoad, type DayLoad, type Load, type Measure } from './workloadModel'

type Span = 7 | 14 | 28

/** Tasks with no course are drawn in a neutral ink, never in a course's color. */
const NO_COURSE = 'var(--color-line-strong)'
/** Height of the bar area: a bar at the top value is exactly this tall, level with the reference line. */
const BAR_AREA = 144
/**
 * Space between course segments: 2px while the segments average at least 3px, none otherwise.
 * A bar's total height is always exactly its value, whatever its number of courses.
 */
const gapFor = (value: number, segments: number, max: number) => ((value / max) * BAR_AREA >= segments * 5 - 2 ? 2 : 0)

/** The scale never shrinks below this, so one task never looks like a full day. */
const FLOOR: Record<Measure, number> = { tasks: 4, time: 120 }

const longDate = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** Time always says how many of the tasks it covers. */
const coverage = (load: Load) => (load.estimated === load.tasks ? '' : ` estimated for ${load.estimated} of ${load.tasks}`)

function amount(load: Load, measure: Measure): string {
  if (measure === 'tasks') return plural(load.tasks, 'task')
  return load.minutes ? `${formatDuration(load.minutes)}${coverage(load)}` : 'No estimates'
}

/** "3 tasks, 1 exam" plus what is known about time. Never implies time it does not know. */
function describe(load: Load): string {
  const parts = [plural(load.tasks, 'task')]
  if (load.exams) parts.push(plural(load.exams, 'exam'))
  if (load.estimated) parts.push(`${formatDuration(load.minutes)} estimated for ${load.estimated === load.tasks ? 'all' : `${load.estimated} of ${load.tasks}`}`)
  return parts.join(', ')
}

/**
 * Seeing the weeks ahead before they arrive: which days are heavy, which courses ask the most,
 * and what is due on any day. Counts tasks; time appears only where students gave estimates.
 */
export default function WorkloadMode() {
  const { now, tasks, courses, courseOf } = useWorkspace()
  const canEstimate = useCanStore('estimate')
  const [span, setSpan] = useState<Span>(14)
  const [picked, setPicked] = useState<Measure>('tasks')
  const [table, setTable] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const order = useMemo(() => courses.map((c) => c.id), [courses])
  const load = useMemo(() => workload(tasks, now, span, order), [tasks, now, span, order])
  const color = (id: string | null) => courses.find((c) => c.id === id)?.color ?? NO_COURSE
  const code = (id: string | null) => courses.find((c) => c.id === id)?.code ?? 'No course'

  // Time is offered only once at least one task in view has an estimate.
  const measure: Measure = picked === 'time' && load.estimated > 0 ? 'time' : 'tasks'
  // Ranked only when the days differ; a list of equal days says nothing.
  const values = load.days.map((d) => valueOf(d, measure)).filter((v) => v > 0)
  const heavy = values.length > 1 && Math.max(...values) > Math.min(...values) ? heaviestDays(load.days, measure) : []
  // A task opened from elsewhere (search, the dashboard): its day, when it is in view.
  const flashId = useUiStore((s) => s.flashTaskId)
  const openDialog = useUiStore((s) => s.openDialog)
  const flashDay = flashId ? load.days.find((d) => d.items.some((t) => t.id === flashId)) : undefined
  const [revealed, setRevealed] = useState<string | null>(null)
  // Not on any day shown here (done, overdue, undated or further out): open it instead. Decided
  // once, when the task is first flashed, so a later edit never opens it on its own.
  // A new object per opening, so the same task opened again opens again.
  const [toOpen, setToOpen] = useState<{ id: string } | null>(null)
  if (flashId !== revealed) {
    setRevealed(flashId)
    if (flashDay) setSelected(flashDay.key)
    else if (flashId) setToOpen({ id: flashId })
  }
  useEffect(() => {
    if (toOpen) openDialog({ type: 'task', id: toOpen.id })
  }, [toOpen, openDialog])
  const day = load.days.find((d) => d.key === selected) ?? heavy[0] ?? load.days[0]!
  const max = Math.max(FLOOR[measure], ...load.days.map((d) => valueOf(d, measure)))
  const rank = (id: string | null) => (id === null ? order.length : order.indexOf(id))
  const present = [...new Set(load.days.flatMap((d) => d.byCourse.map((c) => c.courseId)))].sort((a, b) => rank(a) - rank(b))

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <p className="text-[14px] text-muted">
          <span className="font-medium text-ink">{plural(load.tasks, 'open task')}</span> due in the next {span} days
          {load.exams ? `, ${plural(load.exams, 'exam')}` : ''}
          {load.estimated ? `, ${formatDuration(load.minutes)} estimated for ${load.estimated === load.tasks ? 'all of them' : `${load.estimated} of them`}` : ''}.
          {load.overdue ? <span className="text-bad"> {plural(load.overdue, 'task')} overdue.</span> : null}
          {load.undated ? ` ${plural(load.undated, 'task')} with no date.` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {load.estimated > 0 ? (
            <SegmentedTabs
              label="Measure"
              value={measure}
              onChange={setPicked}
              options={[
                { value: 'tasks', label: 'Tasks' },
                { value: 'time', label: 'Time needed' },
              ]}
            />
          ) : null}
          <SegmentedTabs
            label="Range"
            value={String(span) as `${Span}`}
            onChange={(v) => setSpan(Number(v) as Span)}
            options={[
              { value: '7', label: '1 week' },
              { value: '14', label: '2 weeks' },
              { value: '28', label: '4 weeks' },
            ]}
          />
        </div>
      </div>

      <section aria-label="Due each day" className="mt-5">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-[13px] font-semibold text-muted">
            {measure === 'tasks' ? 'Tasks due each day' : 'Estimated time due each day'}
            {measure === 'time' && load.estimated < load.tasks ? <span className="font-normal text-faint"> · only tasks with an estimate</span> : null}
          </h2>
          <button
            type="button"
            aria-pressed={table}
            onClick={() => setTable((t) => !t)}
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-[13px] text-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            {table ? 'Show chart' : 'Show as table'}
          </button>
        </div>
        {table ? (
          <DayTable days={load.days} selected={day.key} onSelect={setSelected} />
        ) : (
          <>
            <Chart days={load.days} measure={measure} max={max} span={span} selected={day.key} onSelect={setSelected} color={color} code={code} now={now} />
            {present.length > 1 || load.exams ? (
              <ul aria-label="Key" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {present.length > 1
                  ? present.map((id) => (
                      <li key={id ?? 'none'} className="inline-flex items-center gap-1.5">
                        <i className="size-2 rounded-[2px]" style={{ background: color(id) }} aria-hidden="true" />
                        {code(id)}
                      </li>
                    ))
                  : null}
                {load.exams ? (
                  <li className="inline-flex items-center gap-1.5">
                    <i className="size-1.5 rotate-45 rounded-[1px] bg-ink" aria-hidden="true" />
                    Exam
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        )}
      </section>

      <div className="mt-8 grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DayDetail day={day} now={now} courseOf={courseOf} canEstimate={canEstimate} />
        <div className="flex flex-col gap-8">
          {heavy.length ? (
            <section aria-label="Heaviest days">
              <h2 className="mb-2 text-[13px] font-semibold text-muted">Heaviest days</h2>
              <ol className="divide-y divide-line/60">
                {heavy.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      onClick={() => setSelected(d.key)}
                      className="flex w-full cursor-pointer items-baseline justify-between gap-3 px-1 py-2 text-left text-[14px] hover:bg-fill/50 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      <span className="font-medium text-ink">{longDate(d.date)}</span>
                      <span className="text-xs whitespace-nowrap text-muted tabular-nums">
                        {amount(d, measure)}
                        {d.exams ? `, ${plural(d.exams, 'exam')}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <ByCourse courses={load.courses} measure={measure} color={color} code={code} />
        </div>
      </div>
    </div>
  )
}

function Chart({
  days,
  measure,
  max,
  span,
  selected,
  onSelect,
  color,
  code,
  now,
}: {
  days: DayLoad[]
  measure: Measure
  max: number
  span: Span
  selected: string
  onSelect: (key: string) => void
  color: (id: string | null) => string
  code: (id: string | null) => string
  now: Date
}) {
  const todayKey = days[0]?.key
  return (
    <div className="pt-4">
      <div className="relative" style={{ height: BAR_AREA }}>
        {/* One recessive reference line at the top value, labeled; no grid. It sits exactly where a full bar ends. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 border-t border-dashed border-line" aria-hidden="true">
          <span className="absolute -top-2 right-0 bg-surface pl-1 text-[11px] text-faint tabular-nums">{measure === 'tasks' ? plural(max, 'task') : formatDuration(max)}</span>
        </div>
        <div className="grid h-full items-end gap-[3px] border-b border-line-strong" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((d, index) => {
          const value = valueOf(d, measure)
          const parts = d.byCourse.filter((c) => valueOf(c, measure) > 0)
          const label = `${d.date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}: ${d.tasks ? describe(d) : 'nothing due'}${parts.length > 1 ? ` (${parts.map((c) => `${code(c.courseId)} ${measure === 'tasks' ? c.tasks : `${estimateShort(c.minutes)}${coverage(c)}`}`).join(', ')})` : parts.length === 1 ? ` (${code(parts[0]!.courseId)})` : ''}`
          return (
            <button
              key={d.key}
              type="button"
              aria-label={label}
              aria-current={d.key === selected ? 'true' : undefined}
              onClick={() => onSelect(d.key)}
              className={cn(
                'group relative flex h-full cursor-pointer items-end justify-center rounded-t-md outline-none hover:bg-fill/60 focus-visible:ring-2 focus-visible:ring-accent',
                d.key === selected && 'bg-fill',
              )}
            >
              {/*
                A thin bar inside a wide hit area: course segments stacked from the baseline, 2px apart.
                The gaps come out of the bar's own height, so the top of a bar always reads its true value.
              */}
              <span className="relative flex w-full max-w-6 flex-col-reverse items-stretch" style={{ gap: gapFor(value, parts.length, max) }}>
                {parts.map((c, i) => {
                  const room = (value / max) * BAR_AREA - gapFor(value, parts.length, max) * (parts.length - 1)
                  return (
                    <i
                      key={c.courseId ?? 'none'}
                      className={cn('block w-full shrink-0', i === parts.length - 1 && 'rounded-t-[4px]')}
                      style={{ height: `${(valueOf(c, measure) / value) * room}px`, background: color(c.courseId) }}
                    />
                  )
                })}
                {/* Above the bar, never part of its height. */}
                {d.exams ? <span className="absolute -top-3 left-1/2 size-1.5 -translate-x-1/2 rotate-45 rounded-[1px] bg-ink" aria-hidden="true" /> : null}
              </span>
              {/* Hover and focus detail. Text in text inks; the color sits beside it. */}
              <span
                role="presentation"
                className={cn(
                  'pointer-events-none absolute bottom-full z-10 mb-2 hidden w-max max-w-56 rounded-md border border-line bg-surface px-2.5 py-2 text-left text-xs shadow-pop group-hover:block group-focus-visible:block',
                  // Outer columns open inward, so the detail stays on screen.
                  index < 3 ? 'left-0' : index >= days.length - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                )}
              >
                <span className="block font-semibold text-ink">{d.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                {value === 0 && measure === 'tasks' ? <span className="block text-muted">Nothing due</span> : null}
                {d.byCourse.map((c) => (
                  <span key={c.courseId ?? 'none'} className="mt-0.5 flex items-center gap-1.5 text-muted">
                    <i className="size-2 shrink-0 rounded-[2px]" style={{ background: color(c.courseId) }} />
                    <span className="text-ink">{code(c.courseId)}</span>
                    <span className="tabular-nums">
                      {plural(c.tasks, 'task')}
                      {c.estimated ? `, ${estimateShort(c.minutes)}${coverage(c)}` : ''}
                    </span>
                  </span>
                ))}
              </span>
            </button>
          )
        })}
        </div>
      </div>
      <div className="mt-1.5 grid gap-[3px] text-center text-[11px] text-faint" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {days.map((d, i) => {
          // Every day for one or two weeks; Mondays (and today) for four.
          const show = span < 28 || i === 0 || d.date.getDay() === 1
          return (
            <span key={d.key} className={cn('truncate tabular-nums', d.key === todayKey && 'font-semibold text-ink', d.key === selected && 'text-ink')}>
              {show ? (
                <>
                  {/* Narrow screens: the date alone, so no label is cut off. */}
                  <span className="sm:hidden">{d.date.getDate()}</span>
                  <span className="max-sm:hidden">{span === 28 ? shortDate(d.date) : `${WEEKDAY_SHORT[d.date.getDay()]} ${d.date.getDate()}`}</span>
                </>
              ) : (
                ''
              )}
            </span>
          )
        })}
      </div>
      <p className="sr-only">Today is {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</p>
    </div>
  )
}

function DayTable({ days, selected, onSelect }: { days: DayLoad[]; selected: string; onSelect: (key: string) => void }) {
  return (
    <table className="w-full text-[13px]">
      <thead className="text-left text-xs text-muted">
        <tr className="border-b border-line">
          <th className="py-1.5 pr-3 font-medium">Day</th>
          <th className="py-1.5 pr-3 text-right font-medium">Tasks</th>
          <th className="py-1.5 pr-3 text-right font-medium">Exams</th>
          <th className="py-1.5 text-right font-medium">Estimated time</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {days.map((d) => (
          <tr key={d.key} className="border-b border-line/60">
            <th scope="row" className="py-0.5 pr-3 text-left font-normal">
              <button
                type="button"
                aria-current={d.key === selected ? 'true' : undefined}
                onClick={() => onSelect(d.key)}
                className={cn(
                  '-mx-1 cursor-pointer rounded-md px-1 py-1 text-left text-ink hover:bg-fill focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                  d.key === selected && 'font-semibold',
                )}
              >
                {longDate(d.date)}
              </button>
            </th>
            <td className="py-1.5 pr-3 text-right">{d.tasks}</td>
            <td className="py-1.5 pr-3 text-right">{d.exams}</td>
            <td className="py-1.5 text-right text-muted">{d.estimated ? `${formatDuration(d.minutes)} (${d.estimated} of ${d.tasks})` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DayDetail({ day, now, courseOf, canEstimate }: { day: DayLoad; now: Date; courseOf: (t: Task) => Course | undefined; canEstimate: boolean }) {
  return (
    <section aria-label={longDate(day.date)}>
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{longDate(day.date)}</h2>
      <p className="mt-0.5 text-[13px] text-muted">{day.tasks ? describe(day) : 'Nothing due. A good day to get ahead.'}</p>
      {day.items.length ? (
        <ul className="mt-2 divide-y divide-line/60">
          {day.items.map((t) => (
            <DayTask key={t.id} task={t} now={now} course={courseOf(t)} canEstimate={canEstimate} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

/** A task on the chosen day, with its time estimate editable in place. */
function DayTask({ task, now, course, canEstimate }: { task: Task; now: Date; course?: Course; canEstimate: boolean }) {
  const toggle = useTaskStore((s) => s.toggleTask)
  const updateTask = useTaskStore((s) => s.updateTask)
  const openDialog = useUiStore((s) => s.openDialog)
  const due = dueLabel(task, now)
  const custom = task.estimate && !(ESTIMATES as readonly number[]).includes(task.estimate)
  return (
    <li data-task-id={task.id} className="flex items-center gap-3 px-1 py-2.5">
      <CheckButton checked={task.done} onChange={() => toggle(task.id)} label={`Mark done: ${task.title}`} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => openDialog({ type: 'task', id: task.id })}
          className="block max-w-full cursor-pointer truncate rounded-sm text-left text-[14px] font-medium text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          {task.title}
        </button>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {course ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <i className="size-1.5 rounded-full" style={{ background: course.color }} aria-hidden="true" />
              {course.code}
            </span>
          ) : null}
          <span className={DUE_TONE_CLASS[due.tone]}>{due.text}</span>
          {task.category === 'exam' ? <span className="text-faint">Exam</span> : null}
        </span>
      </div>
      {canEstimate ? (
        <select
          aria-label={`Time needed for ${task.title}`}
          value={task.estimate ?? ''}
          onChange={(e) => updateTask(task.id, { estimate: e.target.value ? Number(e.target.value) : null })}
          className="h-8 max-w-28 cursor-pointer rounded-md bg-transparent px-1.5 text-[13px] text-muted transition-colors hover:bg-fill focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <option value="">No estimate</option>
          {custom ? <option value={task.estimate!}>{estimateLabel(task.estimate!)}</option> : null}
          {ESTIMATES.map((m) => (
            <option key={m} value={m}>
              {estimateLabel(m)}
            </option>
          ))}
        </select>
      ) : null}
    </li>
  )
}

function ByCourse({ courses, measure, color, code }: { courses: CourseLoad[]; measure: Measure; color: (id: string | null) => string; code: (id: string | null) => string }) {
  if (!courses.length) return null
  const max = Math.max(1, ...courses.map((c) => valueOf(c, measure)))
  // Longest bar first for whichever measure is shown.
  const sorted = [...courses].sort((a, b) => valueOf(b, measure) - valueOf(a, measure) || b.tasks - a.tasks)
  return (
    <section aria-label="By course">
      <h2 className="mb-2 text-[13px] font-semibold text-muted">By course</h2>
      <ul className="flex flex-col gap-2.5">
        {sorted.map((c) => (
          <li key={c.courseId ?? 'none'} className="grid grid-cols-[5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 text-[13px]">
            <span className="truncate font-medium text-ink">{code(c.courseId)}</span>
            <span className="text-xs text-muted tabular-nums">{describe(c)}</span>
            <span className="col-start-2 block h-1.5 rounded-r-[4px]" style={{ width: `${(valueOf(c, measure) / max) * 100}%`, minWidth: valueOf(c, measure) ? 4 : 0, background: color(c.courseId) }} aria-hidden="true" />
          </li>
        ))}
      </ul>
    </section>
  )
}
