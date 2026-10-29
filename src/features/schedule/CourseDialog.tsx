import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Choice, ChoiceGroup, Input, Label } from '@/components/ui/Field'
import { Dialog } from '@/components/ui/Dialog'
import { COURSE_COLORS } from '@/data/demo'
import { deleteCourse } from '@/store/actions'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

/** Add or edit a course. */
export function CourseDialog({ id }: { id?: string }) {
  const close = useUiStore((s) => s.closeDialog)
  const courses = useScheduleStore((s) => s.courses)
  const addCourse = useScheduleStore((s) => s.addCourse)
  const updateCourse = useScheduleStore((s) => s.updateCourse)
  const existing = courses.find((c) => c.id === id)

  const [code, setCode] = useState(existing?.code ?? '')
  const [name, setName] = useState(existing?.name ?? '')
  const [units, setUnits] = useState(String(existing?.units ?? 3))
  const [color, setColor] = useState<string>(existing?.color ?? COURSE_COLORS[courses.length % COURSE_COLORS.length] ?? COURSE_COLORS[0])
  const [professor, setProfessor] = useState(existing?.professor ?? '')
  const [email, setEmail] = useState(existing?.professorEmail ?? '')
  const [hours, setHours] = useState(existing?.officeHours ?? '')
  const [armed, setArmed] = useState(false)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim()) return
    const data = {
      code: code.trim(),
      name: name.trim(),
      units: Math.max(0, Number(units) || 0),
      color,
      professor: professor.trim() || undefined,
      professorEmail: email.trim() || undefined,
      officeHours: hours.trim() || undefined,
    }
    if (existing) updateCourse(existing.id, data)
    else addCourse(data)
    close()
  }

  return (
    <Dialog title={existing ? 'Edit course' : 'Add course'} onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Course code">
            <Input data-autofocus required maxLength={20} value={code} onChange={(e) => setCode(e.target.value)} placeholder="CS 101" />
          </Label>
          <Label label="Units">
            <Input type="number" required min={0} max={12} step={0.5} value={units} onChange={(e) => setUnits(e.target.value)} />
          </Label>
        </div>
        <Label label="Course name">
          <Input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Data Structures" />
        </Label>
        <ChoiceGroup legend="Color">
          {COURSE_COLORS.map((c) => (
            <Choice
              key={c}
              type="radio"
              name="color"
              value={c}
              checked={color === c}
              onChange={() => setColor(c)}
              className="size-[30px] rounded-full border-2 border-transparent p-0 peer-checked:border-ink"
            >
              <span className="sr-only">{c}</span>
              <i className="absolute inset-0 rounded-full" style={{ background: c }} />
            </Choice>
          ))}
        </ChoiceGroup>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Professor (optional)">
            <Input maxLength={60} value={professor} onChange={(e) => setProfessor(e.target.value)} />
          </Label>
          <Label label="Professor email (optional)">
            <Input type="email" maxLength={80} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Label>
        </div>
        <Label label="Office hours (optional)">
          <Input maxLength={80} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="Tuesdays, 2:00 to 4:00 PM" />
        </Label>
        {existing ? (
          <p className="text-xs text-faint">Deleting a course also deletes its classes and grade components. Its tasks and notes stay.</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {existing ? (
            <Button
              variant="danger"
              className={armed ? 'bg-bad text-[#1a0b0e] hover:bg-bad' : ''}
              onClick={() => {
                if (!armed) {
                  setArmed(true)
                  return
                }
                close()
                deleteCourse(existing.id)
              }}
            >
              {armed ? 'Click again to delete' : 'Delete course'}
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existing ? 'Save course' : 'Add course'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
