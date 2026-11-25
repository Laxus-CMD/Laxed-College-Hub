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
  /**
   * The first and last day this class meets, "YYYY-MM-DD", for academic terms. Missing means
   * no limit on that side, so classes added before terms existed meet every week, as before.
   * Ending a class keeps its past meetings on the calendar instead of deleting them.
   */
  startsOn?: string | null
  endsOn?: string | null
}

export type TaskKind = 'assignment' | 'todo'

/** The ways of working on the Tasks page. Every mode works on the same tasks. */
export const TASK_MODES = ['classic', 'flow', 'focus', 'workload', 'between'] as const
export type TaskMode = (typeof TASK_MODES)[number]

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
  /**
   * What sort of assignment it is, beyond its kind. Only "exam" so far: an exam is an
   * assignment (it can count toward the grade) that the calendar shows differently.
   */
  category?: 'exam' | null
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
  score: number | null // points earned, null until graded
  /** Points possible. Missing or null means 100, so scores entered as percentages keep their meaning. */
  totalScore?: number | null
}

/** Minimum percent needed to earn a grade point. */
export interface GradeScaleRow {
  grade: number
  min: number
}
