import type { ReactNode } from 'react'
import type { CalendarFilter } from './calendarModel'
import type { CalendarPrefs } from './useCalendarPrefs'

const FILTERS: { id: CalendarFilter; label: string }[] = [
  { id: 'classes', label: 'Classes' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'exams', label: 'Exams' },
  { id: 'todos', label: 'To-dos' },
]

function Toggle({ checked, onChange, children, role }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode; role?: 'switch' }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-[7px] px-2 text-[13px] hover:bg-fill">
      {children}
      <input type="checkbox" role={role} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      {role === 'switch' ? (
        <span
          aria-hidden="true"
          className="relative h-[18px] w-[30px] shrink-0 rounded-full bg-fill-strong transition-colors duration-200 peer-checked:bg-accent-fill peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:top-[2px] after:left-[2px] after:size-[14px] after:rounded-full after:bg-white after:shadow-thumb after:transition-transform after:duration-200 peer-checked:after:translate-x-3"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-line-strong text-on-accent transition-colors peer-checked:border-accent-fill peer-checked:bg-accent-fill peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
        >
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M2.5 6.2 5 8.5l4.5-5" />
          </svg>
        </span>
      )}
    </label>
  )
}

/** What the calendar shows, kept in this browser. */
export function DisplayMenu({ prefs, weekends, onChange }: { prefs: CalendarPrefs; weekends: boolean; onChange: (patch: Partial<CalendarPrefs>) => void }) {
  const show = (id: CalendarFilter, on: boolean) => onChange({ hidden: on ? prefs.hidden.filter((h) => h !== id) : [...prefs.hidden, id] })
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 px-2 text-[10.5px] font-semibold tracking-[0.08em] text-faint uppercase">Show</legend>
        {FILTERS.map((f) => (
          <Toggle key={f.id} checked={!prefs.hidden.includes(f.id)} onChange={(on) => show(f.id, on)}>
            {f.label}
          </Toggle>
        ))}
      </fieldset>
      <div className="border-t border-line pt-2">
        <Toggle role="switch" checked={prefs.completed} onChange={(completed) => onChange({ completed })}>
          Completed tasks
        </Toggle>
        <Toggle role="switch" checked={weekends} onChange={(on) => onChange({ weekends: on })}>
          Weekends
        </Toggle>
      </div>
    </div>
  )
}
