import { TASK_MODES, type ClassSession, type Course, type GradeComponent, type GradeScaleRow, type Note, type Task, type TaskMode, type Weekday } from '@/types'
import { DEFAULT_SCALE } from '@/features/grades/gradeMath'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'

/**
 * Everything a student saves, in the shape the API uses (server/dataSchema.ts),
 * plus the pure functions that compare two versions and put one on top of another.
 */

/** In the API, a hand-picked grade and a target belong to their course. */
export type DocCourse = Course & { override?: number; target?: number }

export interface DocProfile {
  name: string
  isDemo: boolean
  bannerDismissed: boolean
  /** The Tasks workspace mode. Null until chosen. */
  taskMode: TaskMode | null
  /** Null means the default scale. */
  scale: GradeScaleRow[] | null
  prior: { cgpa: number | null; units: number | null }
}

export interface Doc {
  profile: DocProfile
  courses: DocCourse[]
  sessions: ClassSession[]
  tasks: Task[]
  notes: Note[]
  components: GradeComponent[]
}

export type Kind = Exclude<keyof Doc, 'profile'>
export const KINDS: Kind[] = ['courses', 'sessions', 'tasks', 'notes', 'components']

/** A note without title and body means "only the links changed". */
export type NotePatch = Omit<Note, 'title' | 'body'> & Partial<Pick<Note, 'title' | 'body'>>

export interface Changes {
  upsert: { courses: DocCourse[]; sessions: ClassSession[]; tasks: Task[]; notes: NotePatch[]; components: GradeComponent[] }
  remove: Record<Kind, string[]>
  profile?: Partial<DocProfile>
}

/** Longest note the server takes. */
export const MAX_NOTE_CHARS = 100_000

// ---------------------------------------------------------------------------
// Cleaning. A half-typed number or a cut-off emoji must never stop a save. Every
// function here gives the same result when applied twice.
// ---------------------------------------------------------------------------

const text = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').slice(0, max).replaceAll('\0', '').replace(/\p{Surrogate}/gu, '�')

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1e6, Math.min(1e6, v)) + 0 : 0)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? num(v) : null)
const optNum = (v: unknown): number | undefined => numOrNull(v) ?? undefined
const optText = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? text(v, max) : undefined)
const matching = (v: unknown, re: RegExp): string | undefined => (typeof v === 'string' && re.test(v) ? v : undefined)

const ID = /^[A-Za-z0-9_-]{1,64}$/
const TIME = /^\d{2}:\d{2}(:\d{2})?$/
const DATE = /^\d{4,6}-\d{2}-\d{2}$/
const DUE = /^\d{4,6}-\d{2}-\d{2}(T\d{2}:\d{2})?$/
const COLOR = /^[#A-Za-z0-9-]{1,32}$/

function stamp(v: unknown): string {
  const t = new Date(typeof v === 'string' ? v : NaN)
  const year = t.getUTCFullYear()
  return year >= 1970 && year <= 9999 ? t.toISOString() : '1970-01-01T00:00:00.000Z'
}

/** Drops undefined, so records compare the same no matter how they were built. */
const tidy = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const CLEAN: { [K in Kind]: (r: Doc[K][number]) => Doc[K][number] } = {
  courses: (c) =>
    tidy({
      id: c.id,
      code: text(c.code, 100),
      name: text(c.name, 300),
      units: num(c.units),
      color: matching(c.color, COLOR) ?? '#8e8e93',
      professor: optText(c.professor, 300),
      professorEmail: optText(c.professorEmail, 300),
      officeHours: optText(c.officeHours, 300),
      override: optNum((c as DocCourse).override),
      target: optNum((c as DocCourse).target),
    }),
  sessions: (s) =>
    tidy({
      id: s.id,
      courseId: s.courseId,
      days: [...new Set(s.days)].filter((d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6),
      start: matching(s.start, TIME) ?? '00:00',
      end: matching(s.end, TIME) ?? '00:00',
      room: optText(s.room, 300),
      building: optText(s.building, 300),
      // Always sent, as a date or null: the server keeps saved dates only when they are missing (older apps).
      startsOn: matching(s.startsOn, DATE) ?? null,
      endsOn: matching(s.endsOn, DATE) ?? null,
    }),
  tasks: (t) =>
    tidy({
      id: t.id,
      kind: t.kind === 'assignment' ? 'assignment' : 'todo',
      // Always sent, as "exam" or null: the server keeps a saved category only when it is missing (older apps).
      // A to-do is never an exam.
      category: t.kind === 'assignment' && t.category === 'exam' ? 'exam' : null,
      // Always sent, as "started" or null: the server keeps saved progress only when it is missing (older apps).
      progress: t.progress === 'started' ? 'started' : null,
      // Always sent, as whole minutes or null, for the same reason.
      estimate: Number.isInteger(t.estimate) && t.estimate! >= 5 && t.estimate! <= 1440 ? t.estimate! : null,
      title: text(t.title, 1000),
      courseId: matching(t.courseId, ID),
      due: matching(t.due, DUE),
      done: Boolean(t.done),
      weight: optNum(t.weight),
      source: t.source === 'ics' ? 'ics' : 'manual',
      externalId: optText(t.externalId, 500) || undefined,
    }),
  notes: (n) => {
    const sessionId = matching(n.sessionId, ID)
    return tidy({
      id: n.id,
      title: text(n.title, 300),
      body: text(n.body, MAX_NOTE_CHARS),
      courseId: matching(n.courseId, ID),
      sessionId,
      sessionDate: sessionId ? matching(n.sessionDate, DATE) : undefined,
      createdAt: stamp(n.createdAt),
      updatedAt: stamp(n.updatedAt),
    })
  },
  components: (c) => ({
    id: c.id,
    courseId: c.courseId,
    name: text(c.name, 300),
    weight: num(c.weight),
    score: numOrNull(c.score),
    // Always sent, as a number or null. The server reads a missing total as "keep what is saved",
    // which is what apps before 1.7.0 need, so clearing one has to say null.
    totalScore: typeof c.totalScore === 'number' && Number.isFinite(c.totalScore) && c.totalScore > 0 ? num(c.totalScore) : null,
  }),
}

function cleanList<K extends Kind>(kind: K, list: readonly Doc[K][number][]): Doc[K] {
  const byId = new Map<string, Doc[K][number]>()
  for (const r of list) {
    if (typeof r.id !== 'string' || !ID.test(r.id)) continue
    // Classes and components cannot exist without a course.
    if ((kind === 'sessions' || kind === 'components') && !ID.test((r as ClassSession).courseId)) continue
    byId.set(r.id, CLEAN[kind](r))
  }
  return [...byId.values()] as Doc[K]
}

const sameScale = (a: GradeScaleRow[]) => JSON.stringify(a) === JSON.stringify(DEFAULT_SCALE.map(cleanRow))
const cleanRow = (r: GradeScaleRow): GradeScaleRow => ({ grade: num(r.grade), min: num(r.min) })

export function cleanDoc(d: Doc): Doc {
  const scale = d.profile.scale?.slice(0, 20).map(cleanRow) ?? null
  return {
    profile: {
      name: text(d.profile.name, 60),
      isDemo: Boolean(d.profile.isDemo),
      bannerDismissed: Boolean(d.profile.bannerDismissed),
      taskMode: (TASK_MODES as readonly unknown[]).includes(d.profile.taskMode) ? d.profile.taskMode : null,
      scale: scale && sameScale(scale) ? null : scale,
      prior: { cgpa: numOrNull(d.profile.prior.cgpa), units: numOrNull(d.profile.prior.units) },
    },
    courses: cleanList('courses', d.courses),
    sessions: cleanList('sessions', d.sessions),
    tasks: cleanList('tasks', d.tasks),
    notes: cleanList('notes', d.notes),
    components: cleanList('components', d.components),
  }
}

// ---------------------------------------------------------------------------
// To and from the app's stores
// ---------------------------------------------------------------------------

export function readStores(): Doc {
  const { courses, sessions } = useScheduleStore.getState()
  const { components, scale, overrides, targets, prior } = useGradeStore.getState()
  const { name, isDemo, bannerDismissed, taskMode } = useSettingsStore.getState()
  return cleanDoc({
    profile: { name, isDemo, bannerDismissed, taskMode, scale, prior },
    courses: courses.map((c) => ({ ...c, override: overrides[c.id], target: targets[c.id] })),
    sessions,
    tasks: useTaskStore.getState().tasks,
    notes: useNoteStore.getState().notes,
    components,
  })
}

export function writeStores(d: Doc): void {
  const pick = (key: 'override' | 'target') =>
    Object.fromEntries(d.courses.filter((c) => c[key] !== undefined).map((c) => [c.id, c[key]!]))
  useScheduleStore.setState({
    courses: d.courses.map(({ override: _o, target: _t, ...c }) => c),
    sessions: d.sessions,
  })
  useTaskStore.setState({ tasks: d.tasks })
  useNoteStore.setState({ notes: d.notes })
  useGradeStore.setState({
    components: d.components,
    scale: (d.profile.scale ?? DEFAULT_SCALE).map((r) => ({ ...r })),
    overrides: pick('override'),
    targets: pick('target'),
    prior: d.profile.prior,
  })
  useSettingsStore.setState({ name: d.profile.name, isDemo: d.profile.isDemo, bannerDismissed: d.profile.bannerDismissed, taskMode: d.profile.taskMode })
}

// ---------------------------------------------------------------------------
// Comparing and combining
// ---------------------------------------------------------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** What turns `from` into `to`. Both must be clean. */
export function diff(from: Doc, to: Doc): Changes {
  const changes: Changes = {
    upsert: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
    remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
  }
  for (const kind of KINDS) {
    const before = new Map<string, Doc[Kind][number]>(from[kind].map((r) => [r.id, r]))
    const list = changes.upsert[kind] as object[]
    for (const record of to[kind]) {
      const old = before.get(record.id)
      before.delete(record.id)
      if (old === record || same(old, record)) continue
      if (kind === 'notes' && old && (old as Note).title === (record as Note).title && (old as Note).body === (record as Note).body) {
        const { title: _t, body: _b, ...links } = record as Note
        list.push(links)
      } else {
        list.push(record)
      }
    }
    changes.remove[kind] = [...before.keys()]
  }
  const profile = Object.fromEntries(
    (Object.keys(to.profile) as (keyof DocProfile)[]).filter((k) => !same(from.profile[k], to.profile[k])).map((k) => [k, to.profile[k]]),
  )
  if (Object.keys(profile).length) changes.profile = profile
  return changes
}

export function isEmpty(c: Changes): boolean {
  return !c.profile && KINDS.every((k) => c.upsert[k].length === 0 && c.remove[k].length === 0)
}

/**
 * Fields an older app leaves out of a record (term dates and category before 1.9.0, totals before
 * 1.7.0). A record without one keeps what the document holds, as the server does. Without this, a
 * change saved by an older app and replayed here would clear them once cleaned.
 */
export const KEEP_IF_MISSING: Partial<Record<Kind, readonly string[]>> = {
  sessions: ['startsOn', 'endsOn'],
  tasks: ['category', 'progress', 'estimate'],
  components: ['totalScore'],
}

/** Puts changes on top of a document. `renamed` maps a note to the copy that now holds this device's text. */
export function apply(doc: Doc, changes: Changes, renamed: Record<string, string> = {}): Doc {
  const out = { ...doc, profile: { ...doc.profile, ...changes.profile } }
  for (const kind of KINDS) {
    const rename = (id: string) => (kind === 'notes' ? (renamed[id] ?? id) : id)
    const records = new Map<string, object>(doc[kind].map((r) => [r.id, r]))
    for (const id of changes.remove[kind]) records.delete(rename(id))
    for (const sent of changes.upsert[kind]) {
      const id = rename(sent.id)
      const old = records.get(id) as Note | undefined
      if (kind === 'notes' && (sent as NotePatch).body === undefined) {
        // Only the links changed. If the note is gone, there is nothing left to link.
        if (old) records.set(id, { ...sent, id, title: old.title, body: old.body })
      } else {
        const was = old as Record<string, unknown> | undefined
        const kept = was
          ? Object.fromEntries(
              (KEEP_IF_MISSING[kind] ?? [])
                .filter((k) => (sent as Record<string, unknown>)[k] === undefined && was[k] != null)
                .map((k) => [k, was[k]]),
            )
          : {}
        records.set(id, { ...sent, ...kept, id })
      }
    }
    ;(out as Record<Kind, object[]>)[kind] = [...records.values()]
  }
  return cleanDoc(out)
}

export const docsEqual = (a: Doc, b: Doc) => isEmpty(diff(a, b))
