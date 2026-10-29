import { useState, type FormEvent } from 'react'
import type { TaskKind } from '@/types'
import { Button } from '@/components/ui/Button'
import { Choice, ChoiceGroup, Input, Label, Select } from '@/components/ui/Field'
import { Dialog } from '@/components/ui/Dialog'
import { deleteTask } from '@/store/actions'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'

/** Splits a stored due value into the date and time inputs. 23:59 means "no time". */
function splitDue(due?: string): { date: string; time: string } {
  if (!due) return { date: '', time: '' }
  const [date = '', time = ''] = due.split('T')
  return { date, time: time === '23:59' ? '' : time.slice(0, 5) }
}

export function TaskDialog({ id, courseId }: { id?: string; courseId?: string }) {
  const close = useUiStore((s) => s.closeDialog)
  const courses = useScheduleStore((s) => s.courses)
  const existing = useTaskStore((s) => s.tasks.find((t) => t.id === id))
  const addTask = useTaskStore((s) => s.addTask)
  const updateTask = useTaskStore((s) => s.updateTask)

  const initialDue = splitDue(existing?.due)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [kind, setKind] = useState<TaskKind>(existing?.kind ?? 'assignment')
  const [course, setCourse] = useState(existing?.courseId ?? courseId ?? '')
  const [date, setDate] = useState(initialDue.date)
  const [time, setTime] = useState(initialDue.time)
  const [weight, setWeight] = useState(existing?.weight?.toString() ?? '')

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const parsedWeight = weight === '' ? undefined : Math.max(0, Math.min(100, Number(weight)))
    const data = {
      kind,
      title: trimmed,
      courseId: course || undefined,
      due: date ? `${date}T${time || '23:59'}` : undefined,
      weight: kind === 'assignment' && Number.isFinite(parsedWeight) ? parsedWeight : undefined,
    }
    if (existing) updateTask(existing.id, data)
    else addTask(data)
    close()
  }

  return (
    <Dialog title={existing ? 'Edit task' : 'New task'} onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Label label="Task">
          <Input
            data-autofocus
            required
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
          />
        </Label>
        <ChoiceGroup legend="Type">
          <Choice type="radio" name="kind" value="assignment" checked={kind === 'assignment'} onChange={() => setKind('assignment')}>
            Assignment
          </Choice>
          <Choice type="radio" name="kind" value="todo" checked={kind === 'todo'} onChange={() => setKind('todo')}>
            To-do
          </Choice>
        </ChoiceGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Course">
            <Select value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}: {c.name}
                </option>
              ))}
            </Select>
          </Label>
          <Label label="Due date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Due time (optional)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} />
          </Label>
          {kind === 'assignment' ? (
            <Label label="Worth, percent of grade">
              <Input
                type="number"
                min={0}
                max={100}
                step="any"
                placeholder="10"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </Label>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {existing ? (
            <Button
              variant="danger"
              onClick={() => {
                close()
                deleteTask(existing.id)
              }}
            >
              Delete
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existing ? 'Save task' : 'Add task'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
