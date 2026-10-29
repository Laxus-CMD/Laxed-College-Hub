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
      <Search className="pointer-events-none absolute top-[13px] left-3.5 size-[18px] text-muted" aria-hidden="true" />
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
        className="h-11 w-full rounded-[14px] border border-transparent bg-canvas pr-11 pl-[42px] text-sm placeholder:text-muted focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      <kbd className="pointer-events-none absolute top-[11px] right-3 hidden rounded-md border border-line-strong px-[7px] text-[11px] leading-5 text-faint lg:block">
        /
      </kbd>
      {open && query.trim() ? (
        <div
          id="search-results"
          role="listbox"
          className="absolute inset-x-0 top-[50px] z-30 max-h-[360px] overflow-auto rounded-[14px] border border-line-strong bg-raised p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
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
                className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left', i === index && 'bg-white/8')}
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
