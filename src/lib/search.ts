import type { ClassSession, Course, Note, Task } from '@/types'
import { dueLabel } from '@/features/assignments/urgency'
import { WEEKDAY_SHORT, formatRange } from '@/lib/time'

export type SearchKind = 'course' | 'task' | 'class' | 'note'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  color?: string
}

export interface SearchData {
  courses: Course[]
  sessions: ClassSession[]
  tasks: Task[]
  notes: Note[]
}

/** Case-insensitive search across courses, tasks, classes and notes. */
export function searchAll(query: string, data: SearchData, now: Date, limit = 8): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  const course = (id?: string) => data.courses.find((c) => c.id === id)

  for (const c of data.courses) {
    if (`${c.code} ${c.name}`.toLowerCase().includes(q)) {
      hits.push({ kind: 'course', id: c.id, title: `${c.code}: ${c.name}`, subtitle: `${c.units} units`, color: c.color })
    }
  }
  for (const t of data.tasks) {
    const c = course(t.courseId)
    if (`${t.title} ${c?.code ?? ''}`.toLowerCase().includes(q)) {
      hits.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        subtitle: `${c ? `${c.code}, ` : ''}${dueLabel(t, now).text}`,
        color: c?.color,
      })
    }
  }
  for (const s of data.sessions) {
    const c = course(s.courseId)
    if (`${c?.code ?? ''} ${c?.name ?? ''} ${s.room ?? ''} ${s.building ?? ''}`.toLowerCase().includes(q)) {
      hits.push({
        kind: 'class',
        id: s.id,
        title: `${c?.code ?? 'Class'} on ${s.days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`,
        subtitle: `${formatRange(s.start, s.end)}${s.room ? `, ${s.room}` : ''}`,
        color: c?.color,
      })
    }
  }
  for (const n of data.notes) {
    if (`${n.title} ${n.body}`.toLowerCase().includes(q)) {
      const c = course(n.courseId)
      hits.push({ kind: 'note', id: n.id, title: n.title || 'Untitled note', subtitle: c?.code ?? 'Note', color: c?.color })
    }
  }
  return hits.slice(0, limit)
}
