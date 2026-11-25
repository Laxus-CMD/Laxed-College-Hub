import type { GradeScaleRow } from '@/types'
import { makeDemoData } from '@/data/demo'
import { readDevice, removeDevice, writeDevice } from '@/lib/storage'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { cleanDoc, docsEqual, KINDS, MAX_NOTE_CHARS, type Doc, type DocCourse } from '@/sync/doc'

/**
 * What a guest saved in this browser, for bringing it into an account. Data from
 * the browser or a file can be damaged or made up, so everything is checked.
 */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Json => (isObject(v) ? v : {})
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : [])
const numOrNull = (v: unknown) => (typeof v === 'number' ? v : null)

/** Turns anything shaped roughly like saved data into a clean document. */
export function toDoc(raw: Json): Doc {
  const profile = obj(raw.profile)
  const prior = obj(profile.prior)
  return cleanDoc({
    profile: {
      name: typeof profile.name === 'string' ? profile.name : '',
      isDemo: profile.isDemo === true,
      bannerDismissed: profile.bannerDismissed === true,
      taskMode: profile.taskMode as Doc['profile']['taskMode'],
      scale: Array.isArray(profile.scale) ? (list(profile.scale) as unknown as GradeScaleRow[]) : null,
      prior: { cgpa: numOrNull(prior.cgpa), units: numOrNull(prior.units) },
    },
    courses: list(raw.courses) as unknown as Doc['courses'],
    sessions: list(raw.sessions).map((s) => ({ ...s, days: Array.isArray(s.days) ? s.days : [] })) as unknown as Doc['sessions'],
    tasks: list(raw.tasks) as unknown as Doc['tasks'],
    // Cleaning would cut off a note that is too long, so split it first.
    notes: list(raw.notes).flatMap(splitLongNote) as unknown as Doc['notes'],
    components: list(raw.components) as unknown as Doc['components'],
  })
}

function splitLongNote(n: Json): Json[] {
  const body = typeof n.body === 'string' ? n.body : ''
  if (body.length <= MAX_NOTE_CHARS) return [n]
  const parts: string[] = []
  for (let rest = body; rest; ) {
    let end = MAX_NOTE_CHARS
    // Never between the two halves of an emoji.
    if (/[\uD800-\uDBFF]/.test(rest[end - 1] ?? '')) end--
    parts.push(rest.slice(0, end))
    rest = rest.slice(end)
  }
  const title = typeof n.title === 'string' && n.title ? n.title : 'Untitled note'
  return parts.map((part, i) => (i === 0 ? { ...n, body: part } : { ...n, id: `${String(n.id).slice(0, 50)}-part${i + 1}`, title: `${title} (part ${i + 1})`, body: part }))
}

const stores = () => [useScheduleStore, useTaskStore, useNoteStore, useGradeStore, useSettingsStore] as const

/** The guest data in this browser, or null if there is none. */
export function readDeviceDoc(): Doc | null {
  let found = false
  const [schedule, tasks, notes, grades, settings] = stores().map((store) => {
    const text = readDevice(store.persist.getOptions().name!)
    // A store that never changed was never written, so the guest still sees what it starts with: the sample.
    if (text === null) return store.getInitialState() as unknown as Json
    found = true
    try {
      return obj(obj(JSON.parse(text)).state)
    } catch {
      return {}
    }
  }) as [Json, Json, Json, Json, Json]
  if (!found) return null
  const overrides = obj(grades.overrides)
  const targets = obj(grades.targets)
  return toDoc({
    profile: { ...settings, scale: grades.scale, prior: grades.prior },
    courses: list(schedule.courses).map((c) => ({ ...c, override: overrides[String(c.id)], target: targets[String(c.id)] })),
    sessions: schedule.sessions,
    tasks: tasks.tasks,
    notes: notes.notes,
    components: grades.components,
  })
}

/** Removes the guest data from this browser. Theme and sign-in stay. */
export function clearDeviceData(): void {
  for (const store of stores()) removeDevice(store.persist.getOptions().name!)
  removeDevice(LATER_KEY)
}

const LATER_KEY = 'college-hub.import-later'
/** Someone said "Not now" in this browser, so stop asking. Import stays in Your data. */
export const importDismissed = () => readDevice(LATER_KEY) !== null
export const dismissImport = () => writeDevice(LATER_KEY, '1')

/**
 * Leaves out sample data that was never changed. If the sample was partly used,
 * for example by typing a score into a sample course, that course stays whole.
 */
export function withoutUntouchedSample(doc: Doc): Doc {
  if (!doc.profile.isDemo) return doc
  const demo = cleanDoc({ ...doc, ...makeDemoData(new Date(0)) })
  // Sample dates depend on the day it was made, and ticking a sample task is just trying it out.
  const key = (record: object) => {
    const { due: _due, done: _done, createdAt: _c, updatedAt: _u, sessionDate: _s, ...rest } = record as Json
    return JSON.stringify(rest)
  }
  const samples = new Map(KINDS.flatMap((kind) => demo[kind].map((r) => [`${kind} ${r.id}`, key(r)] as const)))
  const touched = (kind: (typeof KINDS)[number]) => (r: { id: string }) => samples.get(`${kind} ${r.id}`) !== key(r)

  const tasks = doc.tasks.filter(touched('tasks'))
  const notes = doc.notes.filter(touched('notes'))
  const keep = new Set<string | undefined>([
    ...doc.courses.filter(touched('courses')).map((c) => c.id),
    ...[...doc.sessions.filter(touched('sessions')), ...doc.components.filter(touched('components')), ...tasks, ...notes].map((r) => r.courseId),
  ])
  return {
    ...doc,
    courses: doc.courses.filter((c) => keep.has(c.id)),
    sessions: doc.sessions.filter((s) => keep.has(s.courseId)),
    components: doc.components.filter((c) => keep.has(c.courseId)),
    tasks,
    notes,
  }
}

/** True when there is something a student would miss. A name alone does not count. */
export function hasOwnData(doc: Doc): boolean {
  const { scale, prior } = doc.profile
  return KINDS.some((k) => doc[k].length > 0) || scale !== null || prior.cgpa !== null || prior.units !== null
}

// ---------------------------------------------------------------------------
// Backup files
// ---------------------------------------------------------------------------

const APP = 'college-hub'
const MAX_FILE = 20_000_000

export function backupText(doc: Doc): string {
  return JSON.stringify({ app: APP, version: 1, savedAt: new Date().toISOString(), ...doc }, null, 2)
}

/** Null when the file is not a College Hub backup. */
export function parseBackup(text: string): Doc | null {
  if (text.length > MAX_FILE) return null
  try {
    const raw: unknown = JSON.parse(text)
    return isObject(raw) && raw.app === APP && raw.version === 1 ? toDoc(raw) : null
  } catch {
    return null
  }
}

export function downloadBackup(doc: Doc, now = new Date()): void {
  const url = URL.createObjectURL(new Blob([backupText(doc)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `college-hub-${now.toISOString().slice(0, 10)}.json`
  link.click()
  // Give the browser a moment to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

export interface Merge {
  /** The account's data with the import added. */
  doc: Doc
  added: Record<(typeof KINDS)[number], number>
  /** False when the account already has all of it. */
  anything: boolean
  /** Records the account already has. Its version stays. */
  skipped: number
}

const norm = (s: string | undefined) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Adds `from` to the account. Nothing in the account changes: the same course
 * typed on two devices becomes one, records it already has are skipped, and a
 * note with different text is added next to the one that is there.
 */
export function mergeImport(account: Doc, from: Doc): Merge {
  const added = { courses: 0, sessions: 0, tasks: 0, notes: 0, components: 0 }
  let skipped = 0
  const doc: Doc = { ...account }

  // Courses first: everything else points at them.
  const courseIds = new Map<string, string>()
  const courses: DocCourse[] = [...account.courses]
  for (const c of from.courses) {
    const same =
      account.courses.find((x) => x.id === c.id) ??
      account.courses.find((x) => norm(x.code) !== '' && norm(x.code) === norm(c.code) && (norm(x.name) === norm(c.name) || !norm(x.name) || !norm(c.name)))
    if (!same) {
      courses.push(c)
      courseIds.set(c.id, c.id)
      added.courses++
      continue
    }
    courseIds.set(c.id, same.id)
    skipped++
    const i = courses.findIndex((x) => x.id === same.id)
    courses[i] = { ...c, ...courses[i]! } // Only fills in what the account left empty.
  }
  doc.courses = courses
  const courseOf = (id: string | undefined) => (id === undefined ? undefined : courseIds.get(id))

  /** Adds the records that `find` does not know, and remembers where the others went. */
  const take = <T extends { id: string }>(existing: T[], incoming: T[], kind: keyof typeof added, find: (r: T) => T | undefined) => {
    const ids = new Map<string, string>()
    const out = [...existing]
    const taken = new Set(existing.map((r) => r.id))
    for (const r of incoming) {
      const same = find(r)
      ids.set(r.id, same?.id ?? r.id)
      if (same || taken.has(r.id)) {
        skipped++
        continue
      }
      taken.add(r.id)
      out.push(r)
      added[kind]++
    }
    return { out, ids }
  }

  const days = (d: readonly number[]) => [...d].sort().join()
  const withCourse = <T extends { courseId: string }>(items: T[]): T[] =>
    items.flatMap((r) => {
      const courseId = courseOf(r.courseId)
      return courseId ? [{ ...r, courseId }] : []
    })

  const sessions = take(account.sessions, withCourse(from.sessions), 'sessions', (s) =>
    account.sessions.find((x) => x.id === s.id || (x.courseId === s.courseId && x.start === s.start && x.end === s.end && days(x.days) === days(s.days))),
  )
  doc.sessions = sessions.out

  doc.components = take(account.components, withCourse(from.components), 'components', (c) =>
    account.components.find((x) => x.id === c.id || (x.courseId === c.courseId && norm(x.name) !== '' && norm(x.name) === norm(c.name))),
  ).out

  const tasks = from.tasks.map((t) => ({ ...t, courseId: courseOf(t.courseId) }))
  doc.tasks = take(account.tasks, tasks, 'tasks', (t) =>
    account.tasks.find(
      (x) =>
        x.id === t.id ||
        (t.externalId !== undefined && x.externalId === t.externalId) ||
        (x.kind === t.kind && norm(x.title) === norm(t.title) && x.due === t.due && x.courseId === t.courseId),
    ),
  ).out

  const textKey = (n: { title: string; body: string }) => JSON.stringify([n.title, n.body])
  const texts = new Set(account.notes.map(textKey))
  const noteIds = new Set(account.notes.map((n) => n.id))
  const notes = [...account.notes]
  for (const n of from.notes) {
    if (texts.has(textKey(n)) || (!n.title.trim() && !n.body.trim())) {
      skipped++
      continue
    }
    const sessionId = n.sessionId === undefined ? undefined : sessions.ids.get(n.sessionId)
    let id = n.id
    for (let i = 2; noteIds.has(id); i++) id = `${n.id.slice(0, 50)}-import${i}`
    noteIds.add(id)
    notes.push({ ...n, id, courseId: courseOf(n.courseId), sessionId, sessionDate: sessionId ? n.sessionDate : undefined })
    added.notes++
  }
  doc.notes = notes

  // Settings the account has not set.
  const p = account.profile
  const prior = p.prior.cgpa === null && p.prior.units === null ? from.profile.prior : p.prior
  const scale = p.scale ?? from.profile.scale
  doc.profile = { ...p, name: p.name || from.profile.name, scale, prior }
  const merged = cleanDoc(doc)
  return {
    doc: merged,
    added,
    // Also counts details that were only filled in, like a target grade.
    anything: !docsEqual(account, merged),
    skipped,
  }
}
