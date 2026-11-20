import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { Dot } from '@/components/ui/Chip'
import { cn } from '@/lib/cn'
import { navigate } from '@/lib/route'
import { useNow } from '@/lib/useNow'
import { searchAll, type SearchHit } from '@/lib/search'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

const KIND_LABEL = { course: 'Course', task: 'Task', class: 'Class', note: 'Note' } as const

export const SEARCH_INPUT_ID = 'global-search'

/** Searches courses, tasks, classes and notes. Press / anywhere to jump here. */
export function SearchBox() {
  const courses = useScheduleStore((s) => s.courses)
  const sessions = useScheduleStore((s) => s.sessions)
  const tasks = useTaskStore((s) => s.tasks)
  const notes = useNoteStore((s) => s.notes)
  const ui = useUiStore()
  const now = useNow(60_000)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const box = useRef<HTMLDivElement>(null)

  const hits = useMemo(
    () => searchAll(query, { courses, sessions, tasks, notes }, now),
    [query, courses, sessions, tasks, notes, now],
  )

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const go = (hit: SearchHit | undefined) => {
    if (!hit) return
    setOpen(false)
    setQuery('')
    if (hit.kind === 'course') {
      ui.setTaskCourse(hit.id)
      navigate('assignments')
    } else if (hit.kind === 'task') {
      ui.setTaskCourse('')
      ui.flashTask(hit.id)
      navigate('assignments')
    } else if (hit.kind === 'class') {
      ui.openDrawer(hit.id)
      navigate('schedule')
    } else {
      ui.selectNote(hit.id)
      navigate('notes')
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && hits.length) {
      e.preventDefault()
      setIndex((i) => (i + 1) % hits.length)
    } else if (e.key === 'ArrowUp' && hits.length) {
      e.preventDefault()
      setIndex((i) => (i - 1 + hits.length) % hits.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(hits[index])
    } else if (e.key === 'Escape') {
      setQuery('')
      setOpen(false)
      e.currentTarget.blur()
    }
  }

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden="true" />
      <input
        id={SEARCH_INPUT_ID}
        type="search"
        role="combobox"
        aria-expanded={open && query.trim() !== ''}
        aria-controls="search-results"
        aria-label="Search courses, tasks, classes and notes"
        autoComplete="off"
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-[10px] border border-transparent bg-fill-strong pr-10 pl-9 text-sm transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-faint focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 rounded-[5px] border border-line-strong px-1.5 font-sans text-[11px] leading-[18px] text-faint lg:block">
        /
      </kbd>
      {open && query.trim() ? (
        <div
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-11 z-30 max-h-[360px] min-w-[280px] animate-[pop-in_160ms_var(--ease-apple)] overflow-auto rounded-xl border border-line bg-raised p-1.5 shadow-pop dark:border-line-strong"
        >
          {hits.length === 0 ? (
            <p className="p-3 text-[13px] text-muted">No matches. Try a course code or a task name.</p>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.kind}-${h.id}`}
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(h)}
                className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left', i === index && 'bg-accent-fill text-on-accent [&_span]:text-on-accent/80')}
              >
                <Dot color={h.color ?? 'var(--color-faint)'} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-medium">{h.title}</b>
                  <span className="block truncate text-xs text-muted">{h.subtitle}</span>
                </span>
                <span className="text-[11px] text-faint">{KIND_LABEL[h.kind]}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
