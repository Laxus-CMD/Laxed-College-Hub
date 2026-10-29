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
  /** Local date-time, "YYYY-MM-DDTHH:mm". A bare "YYYY-MM-DD" means end of that day. */
  due?: string
  done: boolean
  weight?: number // percent of final grade, assignments only
  source: 'manual' | 'ics'
  /** UID from an imported calendar feed. Used to skip duplicates on re-import. */
  externalId?: string
}

/** A concrete upcoming meeting of a session, with real dates. */
export interface NextClass {
  session: ClassSession
  start: Date
  end: Date
  minutesUntil: number
}

export type HeroState =
  | {
      kind: 'in-class'
      session: ClassSession
      start: Date
      end: Date
      minutesLeft: number
      /** 0 to 1 */
      progress: number
    }
  | { kind: 'between-classes'; next: ClassSession; start: Date; minutesUntil: number }
  | { kind: 'study-mode'; urgentTasks: Task[]; next: NextClass | null }

export type Urgency = 'overdue' | 'today' | 'this-week' | 'later' | 'no-date' | 'done'

/** A markdown note, optionally tied to a course and to one meeting of a class session. */
export interface Note {
  id: string
  title: string
  body: string // markdown
  courseId?: string
  sessionId?: string
  /** "YYYY-MM-DD" of the meeting this note belongs to. */
  sessionDate?: string
  createdAt: string // ISO
  updatedAt: string // ISO
}

/** One weighted piece of a course grade, like "Long exam 1". */
export interface GradeComponent {
  id: string
  courseId: string
  name: string
  weight: number // percent of the course grade
  score: number | null // percent, null until graded
}

/** Minimum percent needed to earn a grade point. */
export interface GradeScaleRow {
  grade: number
  min: number
}
