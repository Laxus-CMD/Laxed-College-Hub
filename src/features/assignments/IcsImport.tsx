import { useMemo, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Select, Textarea } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { matchCourse, parseIcs, type IcsItem } from '@/lib/ics'
import { parseLocalIso, plural } from '@/lib/time'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

function formatDue(item: IcsItem): string {
  const d = parseLocalIso(item.due)
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return item.allDay ? date : `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}

/** Import deadlines from a Canvas calendar feed (.ics file or pasted text). */
export function IcsDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const showToast = useUiStore((s) => s.showToast)
  const courses = useScheduleStore((s) => s.courses)
  const tasks = useTaskStore((s) => s.tasks)
  const importTasks = useTaskStore((s) => s.importTasks)

  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [courseFor, setCourseFor] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const items = useMemo(() => parseIcs(text), [text])
  const existingIds = useMemo(() => new Set(tasks.map((t) => t.externalId).filter(Boolean)), [tasks])
  const isNew = (i: IcsItem) => !existingIds.has(i.externalId)
  const chosenCourse = (i: IcsItem) => courseFor[i.externalId] ?? matchCourse(i.courseHint, courses)?.id ?? ''
  const selected = items.filter((i) => isNew(i) && !skipped.has(i.externalId))

  const load = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setText(await file.text())
    setSkipped(new Set())
    setCourseFor({})
  }

  const toggle = (id: string) =>
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const doImport = () => {
    const added = importTasks(
      selected.map((i) => ({
        kind: i.kind,
        title: i.title,
        courseId: chosenCourse(i) || undefined,
        due: i.due,
        externalId: i.externalId,
      })),
    )
    close()
    showToast({ message: `Imported ${plural(added, 'task')}.` })
  }

  return (
    <Dialog title="Import from Canvas" onClose={close} wide>
      <p className="mb-4 text-[13px] text-muted">
        Save your Canvas calendar feed as an .ics file, then drop it here or paste its text. Importing the same
        file again skips what you already have.
      </p>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void load(e.dataTransfer.files[0])
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-2xl border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-accent bg-accent/10' : 'border-line-strong',
        )}
      >
        <Upload className="size-5 text-muted" aria-hidden="true" />
        <p className="text-sm">{fileName ? fileName : 'Drop an .ics file here'}</p>
        <Button size="sm" onClick={() => fileInput.current?.click()}>
          Choose file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          className="sr-only"
          aria-label="Calendar file"
          onChange={(e) => void load(e.target.files?.[0])}
        />
      </div>
      <div className="mt-3">
        <label className="mb-1.5 block text-[13px] text-muted" htmlFor="ics-paste">
          Or paste the file text
        </label>
        <Textarea
          id="ics-paste"
          className="min-h-20 font-mono text-xs"
          placeholder="BEGIN:VCALENDAR"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setFileName('')
          }}
        />
      </div>

      {text.trim() ? (
        items.length === 0 ? (
          <p role="alert" className="mt-3 text-[13px] text-bad">
            No deadlines found. Check that this is an .ics calendar file.
          </p>
        ) : (
          <ul className="mt-4 flex max-h-64 flex-col overflow-y-auto rounded-2xl border border-line" aria-label="Deadlines found">
            {items.map((i) => {
              const fresh = isNew(i)
              return (
                <li key={i.externalId} className="flex items-center gap-3 border-t border-line px-3 py-2.5 first:border-t-0">
                  <input
                    type="checkbox"
                    className="size-4 accent-accent-fill"
                    checked={fresh && !skipped.has(i.externalId)}
                    disabled={!fresh}
                    onChange={() => toggle(i.externalId)}
                    aria-label={`Import ${i.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm', !fresh && 'text-faint')}>{i.title}</p>
                    <p className="text-xs text-muted">{fresh ? formatDue(i) : 'Already imported'}</p>
                  </div>
                  <Select
                    aria-label={`Course for ${i.title}`}
                    className="h-8 w-32 text-xs"
                    value={chosenCourse(i)}
                    disabled={!fresh}
                    onChange={(e) => setCourseFor((prev) => ({ ...prev, [i.externalId]: e.target.value }))}
                  >
                    <option value="">No course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </Select>
                </li>
              )
            })}
          </ul>
        )
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        <span className="flex-1" />
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" disabled={selected.length === 0} onClick={doImport}>
          {selected.length > 0 ? `Import ${plural(selected.length, 'task')}` : 'Import'}
        </Button>
      </div>
    </Dialog>
  )
}
