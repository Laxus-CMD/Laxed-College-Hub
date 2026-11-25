import { useState } from 'react'
import { readDevice, writeDevice } from '@/lib/storage'
import type { CalendarFilter, CalendarView } from './calendarModel'

/** How the calendar looks in this browser. A preference, not student data. */
export const CALENDAR_KEY = 'college-hub.calendar'

const FILTERS: CalendarFilter[] = ['classes', 'assignments', 'exams', 'todos']

export interface CalendarPrefs {
  view: CalendarView
  /** Show Saturday and Sunday. Null until chosen: then they show only when a class meets on them. */
  weekends: boolean | null
  /** Kinds of items left off the calendar. */
  hidden: CalendarFilter[]
  /** Show finished tasks, quieter. */
  completed: boolean
}

export function readPrefs(): CalendarPrefs {
  try {
    const s = JSON.parse(readDevice(CALENDAR_KEY) ?? 'null') as Partial<CalendarPrefs> & { v?: number }
    if (s?.v === 1) {
      return {
        view: s.view === 'month' ? 'month' : 'week',
        weekends: typeof s.weekends === 'boolean' ? s.weekends : null,
        hidden: Array.isArray(s.hidden) ? FILTERS.filter((f) => s.hidden!.includes(f)) : [],
        completed: s.completed !== false,
      }
    }
  } catch {
    // Unreadable: the defaults.
  }
  return { view: 'week', weekends: null, hidden: [], completed: true }
}

export function useCalendarPrefs() {
  const [prefs, setPrefs] = useState(readPrefs)
  // Each change builds on what is saved, so two changes in a row both stick.
  const update = (patch: Partial<CalendarPrefs>) => {
    const next = { ...readPrefs(), ...patch }
    writeDevice(CALENDAR_KEY, JSON.stringify({ v: 1, ...next }))
    setPrefs(next)
  }
  return [prefs, update] as const
}
