/** Core domain types. Everything else in the app builds on these. */

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 0 = Sunday

export interface Course {
  id: string
  code: string // e.g. FNDMATH
  name: string
  units: number
  color: string // hex or tailwind color token
  professor?: string
  professorEmail?: string
  officeHours?: string
}

export interface ClassSession {
  id: string
  courseId: string
  days: Weekday[]
  start: string // "HH:mm" 24h
  end: string // "HH:mm" 24h
  room?: string
  building?: string
}

export type TaskKind = 'assignment' | 'todo'

export interface Task {
  id: string
  kind: TaskKind
  title: string
  courseId?: string
  due?: string // ISO date-time
  done: boolean
  weight?: number // percent of final grade, assignments only
  source: 'manual' | 'ics'
}

export type HeroState =
  | { kind: 'in-class'; session: ClassSession; minutesLeft: number }
  | { kind: 'between-classes'; next: ClassSession; minutesUntil: number }
  | { kind: 'study-mode'; urgentTasks: Task[] }
