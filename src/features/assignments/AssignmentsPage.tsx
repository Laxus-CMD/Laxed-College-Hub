import { Suspense } from 'react'
import { Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { cn } from '@/lib/cn'
import { modeOf } from '@/features/assignments/workspace/modes'
import { ModeSwitcher } from '@/features/assignments/workspace/ModeSwitcher'
import { useFlashedTask } from '@/features/assignments/workspace/useFlashedTask'
import { useTaskMode } from '@/features/assignments/workspace/useTaskMode'
import { useWorkspace } from '@/features/assignments/workspace/useWorkspace'
import { useUiStore } from '@/store/useUiStore'

/**
 * The Tasks workspace. The header, course filter and mode switcher stay put; the mode below
 * decides how the student works with the tasks. Every mode reads and writes the same tasks.
 */
export default function AssignmentsPage() {
  const { all, courses, courseId, setCourseId } = useWorkspace()
  const { modes, mode, setMode, canChoose } = useTaskMode()
  const openDialog = useUiStore((s) => s.openDialog)
  const { View } = modeOf(mode)
  useFlashedTask()

  const done = all.filter((t) => t.done).length
  const percent = all.length ? Math.round((done / all.length) * 100) : 0
  const course = courses.find((c) => c.id === courseId)

  return (
    <>
      <PageHeader
        title="Tasks & Assignments"
        subtitle={`${all.length - done} open, ${done} done`}
        actions={
          <>
            <Button onClick={() => openDialog({ type: 'ics' })}>
              <Upload className="size-4" aria-hidden="true" />
              Import from Canvas
            </Button>
            <Button onClick={() => openDialog({ type: 'task', courseId: courseId || undefined })}>
              <Plus className="size-4" aria-hidden="true" />
              New task with details
            </Button>
          </>
        }
      >
        <div className="mt-2.5 h-1 w-56 overflow-hidden rounded-full bg-fill-strong" role="img" aria-label={`${percent} percent of tasks done`}>
          <i className="block h-full rounded-full bg-accent-fill transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      </PageHeader>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {canChoose ? <ModeSwitcher modes={modes} value={mode} onChange={setMode} /> : <span />}
        {courses.length > 0 ? (
          <label className="flex items-center gap-2 text-[13px] text-muted">
            {course ? <i className="size-2 rounded-full" style={{ background: course.color }} aria-hidden="true" /> : null}
            <span className="sr-only">Show tasks for</span>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className={cn(
                'h-8 cursor-pointer rounded-md bg-transparent px-1.5 font-medium transition-colors hover:bg-fill focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                course ? 'text-ink' : 'text-muted',
              )}
            >
              <option value="">All courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {/* Modes after Classic load on demand; only the mode area waits, never the page. */}
      <Suspense fallback={<p className="py-6 text-[14px] text-muted">Loading…</p>}>
        <View />
      </Suspense>
    </>
  )
}
