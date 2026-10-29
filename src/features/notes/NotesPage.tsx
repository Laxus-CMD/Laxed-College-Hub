import { useMemo, useState } from 'react'
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react'
import type { Note } from '@/types'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { CourseChip } from '@/components/ui/Chip'
import { Input, Label, Select, Textarea } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedTabs } from '@/components/ui/Tabs'
import { cn } from '@/lib/cn'
import { plainPreview } from '@/lib/markdown'
import { dateKey, formatRange, parseDateKey, WEEK_ORDER, WEEKDAY_SHORT } from '@/lib/time'
import { Markdown } from '@/features/notes/Markdown'
import { latestMeetingOnOrBefore } from '@/features/schedule/scheduleUtils'
import { deleteNote } from '@/store/actions'
import { useCourseMap } from '@/store/selectors'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

const shortDate = (key: string) =>
  parseDateKey(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function NoteEditor({ note }: { note: Note }) {
  const updateNote = useNoteStore((s) => s.updateNote)
  const selectNote = useUiStore((s) => s.selectNote)
  const courses = useScheduleStore((s) => s.courses)
  const sessions = useScheduleStore((s) => s.sessions)
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  const courseSessions = sessions.filter((s) => s.courseId === note.courseId)

  const onCourse = (courseId: string) => {
    const keep = sessions.find((s) => s.id === note.sessionId)?.courseId === courseId
    updateNote(note.id, {
      courseId: courseId || undefined,
      ...(keep ? {} : { sessionId: undefined, sessionDate: undefined }),
    })
  }

  const onSession = (sessionId: string) => {
    if (!sessionId) return updateNote(note.id, { sessionId: undefined, sessionDate: undefined })
    const session = sessions.find((s) => s.id === sessionId)
    const date = note.sessionDate ?? dateKey((session && latestMeetingOnOrBefore(session, new Date())) || new Date())
    updateNote(note.id, { sessionId, sessionDate: date })
  }

  return (
    <Card className="flex min-w-0 flex-col gap-4" aria-label="Note editor">
      <div className="flex items-center gap-2 lg:hidden">
        <Button size="sm" variant="subtle" onClick={() => selectNote(null)}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          All notes
        </Button>
      </div>
      <Label label="Title">
        <Input
          value={note.title}
          maxLength={120}
          placeholder="Untitled note"
          onChange={(e) => updateNote(note.id, { title: e.target.value })}
          className="text-base font-medium"
        />
      </Label>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_150px]">
        <Label label="Course">
          <Select value={note.courseId ?? ''} onChange={(e) => onCourse(e.target.value)}>
            <option value="">No course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
        </Label>
        <Label label="Linked class">
          <Select value={note.sessionId ?? ''} onChange={(e) => onSession(e.target.value)} disabled={courseSessions.length === 0}>
            <option value="">{courseSessions.length === 0 ? 'No classes for this course' : 'Not linked'}</option>
            {courseSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {[...s.days].sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map((d) => WEEKDAY_SHORT[d]).join(' ')}, {formatRange(s.start, s.end)}
              </option>
            ))}
          </Select>
        </Label>
        <Label label="Class date">
          <Input
            type="date"
            value={note.sessionDate ?? ''}
            disabled={!note.sessionId}
            onChange={(e) => updateNote(note.id, { sessionDate: e.target.value || undefined })}
          />
        </Label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'preview', label: 'Preview' },
          ]}
        />
        <p className="text-xs text-faint">Markdown works here. Saves as you type.</p>
      </div>
      {mode === 'write' ? (
        <Textarea
          aria-label="Note body"
          className="min-h-[340px] text-[15px]"
          placeholder={'# Heading\n\n- bullet point\n- [ ] something to do\n\n**bold**, *italic* and `code` work too.'}
          value={note.body}
          onChange={(e) => updateNote(note.id, { body: e.target.value })}
        />
      ) : (
        <div className="min-h-[340px] rounded-xl border border-line bg-canvas px-4 py-3.5">
          <Markdown source={note.body} />
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-faint">
          Edited {new Date(note.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </span>
        <Button variant="danger" size="sm" onClick={() => deleteNote(note.id)}>
          <Trash2 className="size-4" aria-hidden="true" />
          Delete note
        </Button>
      </div>
    </Card>
  )
}

export default function NotesPage() {
  const notes = useNoteStore((s) => s.notes)
  const addNote = useNoteStore((s) => s.addNote)
  const courses = useScheduleStore((s) => s.courses)
  const courseMap = useCourseMap()
  const selectedId = useUiStore((s) => s.selectedNoteId)
  const selectNote = useUiStore((s) => s.selectNote)
  const [query, setQuery] = useState('')
  const [courseFilter, setCourseFilter] = useState('')

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...notes]
      .filter((n) => !courseFilter || n.courseId === courseFilter)
      .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }, [notes, query, courseFilter])

  const chosen = notes.find((n) => n.id === selectedId)
  const active = chosen ?? list[0]
  const hasSelection = Boolean(chosen)

  const create = () => {
    const id = addNote({ courseId: courseFilter || undefined })
    setQuery('')
    selectNote(id)
  }

  return (
    <>
      <PageHeader
        title="Notes"
        subtitle="Write in markdown and link a note to the class day it came from."
        actions={
          <Button variant="primary" onClick={create}>
            <Plus className="size-4" aria-hidden="true" />
            New note
          </Button>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cn('flex flex-col gap-3', hasSelection && 'max-lg:hidden')}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-3 left-3.5 size-4 text-muted" aria-hidden="true" />
            <Input
              type="search"
              aria-label="Search notes"
              placeholder="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-surface pl-10"
            />
          </div>
          <Select aria-label="Filter notes by course" value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </Select>
          {list.length === 0 ? (
            <Card>
              <p className="text-muted">{notes.length === 0 ? 'No notes yet. Start one with New note.' : 'No notes match.'}</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Notes">
              {list.map((n) => {
                const course = courseMap.get(n.courseId ?? '')
                const isActive = active?.id === n.id
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => selectNote(n.id)}
                      className={cn(
                        'flex w-full cursor-pointer flex-col gap-1.5 rounded-2xl border px-4 py-3 text-left transition-colors',
                        isActive ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface hover:border-line-strong',
                      )}
                    >
                      <span className="truncate font-medium">{n.title || 'Untitled note'}</span>
                      <span className="truncate text-[13px] text-muted">{plainPreview(n.body, 90, n.title) || 'Empty note'}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-faint">
                        {course ? <CourseChip course={course} /> : null}
                        {n.sessionDate ? <span>Class on {shortDate(n.sessionDate)}</span> : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <div className={cn(!hasSelection && 'max-lg:hidden')}>
          {active ? (
            <NoteEditor key={active.id} note={active} />
          ) : (
            <Card>
              <p className="text-muted">Pick a note, or start a new one.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
