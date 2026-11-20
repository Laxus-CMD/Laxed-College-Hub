import { CalendarDays, ChartColumn, GraduationCap, House, NotebookPen, Pencil, PencilLine, Plus, Settings } from 'lucide-react'
import type { ComponentType } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Dot } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { navigate, type Route } from '@/lib/route'
import { SearchBox } from '@/app/SearchBox'
import { ThemeSegmented, ThemeToggleButton } from '@/app/ThemeToggle'
import { Avatar } from '@/features/auth/Avatar'
import { useAuthStore } from '@/store/useAuthStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

const MENU: { route: Route; label: string; short: string; icon: ComponentType<{ className?: string }> }[] = [
  { route: 'overview', label: 'Overview', short: 'Overview', icon: House },
  { route: 'schedule', label: 'Weekly Schedule', short: 'Schedule', icon: CalendarDays },
  { route: 'assignments', label: 'Tasks & Assignments', short: 'Tasks', icon: PencilLine },
  { route: 'grades', label: 'Grade & GPA Calculator', short: 'Grades', icon: ChartColumn },
  { route: 'notes', label: 'Notes', short: 'Notes', icon: NotebookPen },
]

function SectionTitle({ children }: { children: string }) {
  return <h2 className="px-2 text-[11px] font-semibold tracking-[0.04em] text-faint uppercase">{children}</h2>
}

/**
 * Desktop: a full-height translucent sidebar.
 * Tablet and phone: a header with search and courses, and the menu becomes a bottom tab bar.
 * It is one tree on purpose, so search and links exist once in the page.
 */
export function Sidebar({ route }: { route: Route }) {
  const courses = useScheduleStore((s) => s.courses)
  const openDialog = useUiStore((s) => s.openDialog)
  const taskCourse = useUiStore((s) => s.taskCourse)
  const setTaskCourse = useUiStore((s) => s.setTaskCourse)
  const user = useAuthStore((s) => s.user)

  return (
    <aside
      aria-label="Sidebar"
      // The blur lives on ::before so the aside never becomes the containing block for the fixed tab bar.
      className="relative z-30 flex min-w-0 flex-col gap-4 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-1 before:absolute before:inset-0 before:-z-10 before:content-[''] lg:sticky lg:top-0 lg:h-svh lg:gap-6 lg:border-r lg:border-line lg:px-3 lg:pt-5 lg:pb-3 lg:before:bg-sidebar lg:before:backdrop-blur-2xl"
    >
      <div className="flex items-center gap-2.5 lg:px-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-accent-fill text-on-accent shadow-thumb">
          <GraduationCap className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="flex-1 text-[15px] font-semibold tracking-[-0.01em]">College Hub</span>
        <ThemeToggleButton className="lg:hidden" />
        <IconButton label="Your data" onClick={() => openDialog({ type: 'settings' })} className="lg:hidden">
          <Settings className="size-[18px]" aria-hidden="true" />
        </IconButton>
      </div>

      <SearchBox />

      <nav
        aria-label="Main menu"
        className="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:border-t max-lg:border-line max-lg:bg-sidebar max-lg:pb-[env(safe-area-inset-bottom)] max-lg:backdrop-blur-2xl max-lg:backdrop-saturate-150"
      >
        <h2 className="sr-only">Menu</h2>
        <div className="flex lg:flex-col lg:gap-px">
          {MENU.map(({ route: r, label, short, icon: Icon }) => {
            const active = route === r
            return (
              <a
                key={r}
                href={`#${r}`}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center transition-colors duration-150',
                  // Tab bar
                  'max-lg:h-[58px] max-lg:flex-1 max-lg:flex-col max-lg:justify-center max-lg:gap-1 max-lg:text-[10px] max-lg:font-medium',
                  active ? 'max-lg:text-accent' : 'max-lg:text-faint',
                  // Sidebar list
                  'lg:h-8 lg:gap-2.5 lg:rounded-lg lg:px-2 lg:text-[13.5px]',
                  active ? 'lg:bg-fill-strong lg:font-medium lg:text-ink' : 'lg:text-ink/80 lg:hover:bg-fill',
                )}
              >
                <Icon className={cn('size-[22px] shrink-0 lg:size-[17px]', 'lg:text-accent')} />
                <span className="lg:hidden">{short}</span>
                <span className="truncate max-lg:hidden">{label}</span>
              </a>
            )
          })}
        </div>
      </nav>

      <section aria-label="Courses" className="flex min-h-0 flex-col gap-1.5 lg:flex-1">
        <div className="flex items-center justify-between max-lg:hidden">
          <SectionTitle>Courses</SectionTitle>
          <IconButton label="Add course" onClick={() => openDialog({ type: 'course' })}>
            <Plus className="size-4" aria-hidden="true" />
          </IconButton>
        </div>
        <div className="flex min-h-0 gap-1.5 max-lg:-mx-4 max-lg:overflow-x-auto max-lg:px-4 max-lg:pb-1 max-lg:[scrollbar-width:none] lg:flex-col lg:gap-px lg:overflow-y-auto">
          {courses.length === 0 ? (
            <p className="px-2 py-1.5 text-[13px] text-faint max-lg:hidden">No courses yet. Use the plus button to add one.</p>
          ) : (
            courses.map((c) => {
              const active = route === 'assignments' && taskCourse === c.id
              return (
                <div
                  key={c.id}
                  className={cn(
                    'group flex shrink-0 items-center transition-colors',
                    'max-lg:rounded-full max-lg:border max-lg:border-line max-lg:bg-surface',
                    'lg:rounded-lg lg:hover:bg-fill',
                    active && 'lg:bg-fill',
                  )}
                >
                  <button
                    type="button"
                    title={`Show tasks for ${c.code}`}
                    onClick={() => {
                      setTaskCourse(c.id)
                      navigate('assignments')
                    }}
                    className={cn(
                      'flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left text-[13.5px]',
                      'max-lg:px-3 max-lg:py-1.5 max-lg:text-[13px] max-lg:font-medium',
                      'lg:h-8 lg:pr-1 lg:pl-2.5',
                      active ? 'text-ink' : 'text-ink/80 hover:text-ink',
                    )}
                  >
                    <Dot color={c.color} />
                    <span className="truncate">
                      {c.code}
                      <span className="text-muted max-lg:hidden">{c.name ? ` ${c.name}` : ''}</span>
                    </span>
                  </button>
                  <IconButton
                    label={`Edit ${c.code}`}
                    onClick={() => openDialog({ type: 'course', id: c.id })}
                    className="mr-0.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-lg:hidden pointer-coarse:opacity-100"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </IconButton>
                </div>
              )
            })
          )}
          <button
            type="button"
            onClick={() => openDialog({ type: 'course' })}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-[13px] font-medium text-muted hover:text-ink lg:hidden"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Course
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-2.5 border-t border-line px-1 pt-3 max-lg:hidden">
        <ThemeSegmented />
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-2 pl-0.5" title={user ? user.email : 'Saved on this device'}>
            <Avatar user={user} className="size-6" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-ink">{user ? user.name : 'Guest'}</span>
              <span className="flex items-center gap-1.5 truncate">
                <Dot color="var(--color-good)" className="size-1.5" />
                Saved on this device
              </span>
            </span>
          </span>
          <Button size="sm" variant="subtle" onClick={() => openDialog({ type: 'settings' })}>
            Your data
          </Button>
        </div>
      </div>
    </aside>
  )
}
