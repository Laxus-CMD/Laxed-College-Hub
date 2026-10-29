import { CalendarDays, ChartColumn, House, NotebookPen, Pencil, PencilLine, Plus } from 'lucide-react'
import type { ComponentType } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Dot } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { navigate, type Route } from '@/lib/route'
import { SearchBox } from '@/app/SearchBox'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

const MENU: { route: Route; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { route: 'overview', label: 'Overview', icon: House },
  { route: 'schedule', label: 'Weekly Schedule', icon: CalendarDays },
  { route: 'assignments', label: 'Tasks & Assignments', icon: PencilLine },
  { route: 'grades', label: 'Grade & GPA Calculator', icon: ChartColumn },
  { route: 'notes', label: 'Notes', icon: NotebookPen },
]

export function Sidebar({ route }: { route: Route }) {
  const courses = useScheduleStore((s) => s.courses)
  const openDialog = useUiStore((s) => s.openDialog)
  const taskCourse = useUiStore((s) => s.taskCourse)
  const setTaskCourse = useUiStore((s) => s.setTaskCourse)

  return (
    <aside
      aria-label="Sidebar"
      className="m-3 flex flex-col gap-5 overflow-hidden rounded-[28px] border border-line bg-surface p-4 lg:sticky lg:top-6 lg:m-0 lg:mt-6 lg:mb-6 lg:ml-7 lg:h-[calc(100svh-48px)] lg:self-start"
    >
      <SearchBox />

      <nav aria-label="Main menu">
        <h2 className="px-1.5 text-[15px] font-medium">Menu</h2>
        <div className="mt-2 flex flex-wrap gap-1 lg:flex-col lg:gap-0.5">
          {MENU.map(({ route: r, label, icon: Icon }) => (
            <a
              key={r}
              href={`#${r}`}
              aria-current={route === r ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl px-2.5 py-2 text-muted transition-colors hover:bg-white/5 hover:text-ink max-lg:min-w-0 max-lg:flex-[1_1_calc(50%-4px)]',
                route === r && 'bg-accent/15 text-ink [&>svg]:text-accent',
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </nav>

      <section aria-label="Courses" className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="px-1.5 text-[15px] font-medium">Courses List</h2>
          <IconButton label="Add course" onClick={() => openDialog({ type: 'course' })}>
            <Plus className="size-[18px]" aria-hidden="true" />
          </IconButton>
        </div>
        {courses.length === 0 ? (
          <p className="px-2.5 py-2 text-[13px] text-faint">No courses yet. Use the plus button to add one.</p>
        ) : (
          <div className="-mx-1.5 flex min-h-0 flex-col gap-0.5 overflow-auto px-1.5 max-lg:mx-0 max-lg:flex-row max-lg:flex-wrap max-lg:gap-1.5 max-lg:px-0">
            {courses.map((c) => (
              <div key={c.id} className="group flex items-center rounded-xl hover:bg-white/5 max-lg:rounded-full max-lg:bg-canvas">
                <button
                  type="button"
                  title={`Show tasks for ${c.code}`}
                  onClick={() => {
                    setTaskCourse(c.id)
                    navigate('assignments')
                  }}
                  className={cn(
                    'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl py-2 pr-1.5 pl-2.5 text-left text-muted hover:text-ink max-lg:px-3.5 max-lg:py-1.5',
                    route === 'assignments' && taskCourse === c.id && 'text-ink',
                  )}
                >
                  <Dot color={c.color} />
                  <span className="truncate">
                    {c.code}
                    <span className="max-lg:hidden">{c.name ? `: ${c.name}` : ''}</span>
                  </span>
                </button>
                <IconButton
                  label={`Edit ${c.code}`}
                  onClick={() => openDialog({ type: 'course', id: c.id })}
                  className="mr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:hidden pointer-coarse:opacity-100"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-muted">
        <span className="flex min-w-0 items-center gap-2">
          <Dot color="var(--color-good)" />
          Saved on this device
        </span>
        <Button size="sm" onClick={() => openDialog({ type: 'settings' })}>
          Your data
        </Button>
      </div>
    </aside>
  )
}
