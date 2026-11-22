import { createHash } from 'node:crypto'
import { QUOTAS, type Kind, type SaveBody } from './dataSchema.ts'
import type { Db, Queryable } from './db.ts'
import { HttpError } from './http.ts'

/**
 * Loads and saves one student's schedule, tasks, notes and grades. Every query
 * is scoped to a user id that comes from the session, never from the request.
 */

/** [name in the API, column, Postgres type] for each kind of record. These are the only identifiers put into SQL. */
type Column = readonly [key: string, column: string, type: string]

const TABLES: Record<Kind, { table: string; columns: readonly Column[] }> = {
  courses: {
    table: 'courses',
    columns: [
      ['id', 'id', 'text'],
      ['code', 'code', 'text'],
      ['name', 'name', 'text'],
      ['units', 'units', 'double precision'],
      ['color', 'color', 'text'],
      ['professor', 'professor', 'text'],
      ['professorEmail', 'professor_email', 'text'],
      ['officeHours', 'office_hours', 'text'],
      ['override', 'grade_override', 'double precision'],
      ['target', 'grade_target', 'double precision'],
    ],
  },
  sessions: {
    table: 'class_sessions',
    columns: [
      ['id', 'id', 'text'],
      ['courseId', 'course_id', 'text'],
      ['days', 'days', 'smallint[]'],
      ['start', 'start_time', 'text'],
      ['end', 'end_time', 'text'],
      ['room', 'room', 'text'],
      ['building', 'building', 'text'],
    ],
  },
  tasks: {
    table: 'tasks',
    columns: [
      ['id', 'id', 'text'],
      ['kind', 'kind', 'text'],
      ['title', 'title', 'text'],
      ['courseId', 'course_id', 'text'],
      ['due', 'due', 'text'],
      ['done', 'done', 'boolean'],
      ['weight', 'weight', 'double precision'],
      ['source', 'source', 'text'],
      ['externalId', 'external_id', 'text'],
    ],
  },
  notes: {
    table: 'notes',
    columns: [
      ['id', 'id', 'text'],
      ['title', 'title', 'text'],
      ['body', 'body', 'text'],
      ['courseId', 'course_id', 'text'],
      ['sessionId', 'session_id', 'text'],
      ['sessionDate', 'session_date', 'text'],
      ['createdAt', 'created_at', 'timestamptz'],
      ['updatedAt', 'updated_at', 'timestamptz'],
    ],
  },
  components: {
    table: 'grade_components',
    columns: [
      ['id', 'id', 'text'],
      ['courseId', 'course_id', 'text'],
      ['name', 'name', 'text'],
      ['weight', 'weight', 'double precision'],
      ['score', 'score', 'double precision'],
    ],
  },
}

/** Parents before children, so references always have something to point at. */
const KINDS: Kind[] = ['courses', 'sessions', 'tasks', 'notes', 'components']

/** Stored with notes, but never sent to the browser. */
const NOTE_INTERNAL: readonly Column[] = [
  ['textRevision', 'text_revision', 'integer'],
  ['textClient', 'text_client', 'text'],
]

type Json = Record<string, unknown>

export interface StudentData {
  revision: number
  profile: {
    name: string
    isDemo: boolean
    bannerDismissed: boolean
    scale: { grade: number; min: number }[] | null
    prior: { cgpa: number | null; units: number | null }
  }
  courses: Json[]
  sessions: Json[]
  tasks: Json[]
  notes: Json[]
  components: Json[]
}

interface ProfileRow {
  revision: number
  display_name: string
  is_demo: boolean
  banner_dismissed: boolean
  grade_scale: StudentData['profile']['scale']
  prior_cgpa: number | null
  prior_units: number | null
}

/** One SELECT for everything, so it is one consistent moment and one round trip. */
const LOAD = `SELECT p.revision, p.display_name, p.is_demo, p.banner_dismissed, p.grade_scale, p.prior_cgpa, p.prior_units,
${KINDS.map((kind) => {
  const { table, columns } = TABLES[kind]
  const fields = columns.map(([key, column]) => `'${key}', ${column}`).join(', ')
  return `  (SELECT COALESCE(json_agg(json_build_object(${fields}) ORDER BY seq), '[]') FROM ${table} WHERE user_id = p.user_id) AS ${kind}`
}).join(',\n')}
  FROM student_profiles p WHERE p.user_id = $1`

/** Missing and null mean the same thing to the app, except for a score that is not graded yet. */
function compact(record: Json): Json {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => value !== null || key === 'score'))
}

function toNote({ sessionDate, ...n }: Json): Json {
  const iso = (v: unknown) => new Date(v as string).toISOString()
  return compact({ ...n, createdAt: iso(n.createdAt), updatedAt: iso(n.updatedAt), sessionDate: n.sessionId ? sessionDate : null })
}

export async function loadData(db: Queryable, userId: string): Promise<StudentData> {
  const { rows } = await db.query<ProfileRow & Record<Kind, Json[]>>(LOAD, [userId])
  const p = rows[0]
  return {
    revision: p?.revision ?? 0,
    profile: {
      name: p?.display_name ?? '',
      isDemo: p?.is_demo ?? false,
      bannerDismissed: p?.banner_dismissed ?? false,
      scale: p?.grade_scale ?? null,
      prior: { cgpa: p?.prior_cgpa ?? null, units: p?.prior_units ?? null },
    },
    courses: (p?.courses ?? []).map(compact),
    sessions: (p?.sessions ?? []).map(compact),
    tasks: (p?.tasks ?? []).map(compact),
    notes: (p?.notes ?? []).map(toNote),
    components: (p?.components ?? []).map(compact),
  }
}

export async function currentRevision(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ revision: number }>('SELECT revision FROM student_profiles WHERE user_id = $1', [userId])
  return rows[0]?.revision ?? 0
}

export interface SaveResult {
  revision: number
  /** Everything, when the browser's copy no longer matches the account: another device saved, or we adjusted something. */
  data: StudentData | null
  /** Notes that two devices edited at once: the note's id, and the id of the copy that holds this device's text. */
  noteCopies: Record<string, string>
}

interface SavedNote {
  id: string
  title: string
  body: string
  text_revision: number
  text_client: string
}

/** Applies a whole save, or none of it. Saves for one student take turns. */
export async function saveData(db: Db, userId: string, body: SaveBody): Promise<SaveResult> {
  return db.tx(async (t) => {
    // FOR KEY SHARE waits for an account deletion in progress, and then finds nobody.
    await t.query(
      `INSERT INTO student_profiles (user_id) SELECT id FROM users WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM student_profiles WHERE user_id = $1)
         FOR KEY SHARE ON CONFLICT DO NOTHING`,
      [userId],
    )
    const { rows } = await t.query<ProfileRow>('SELECT * FROM student_profiles WHERE user_id = $1 FOR UPDATE', [userId])
    const profile = rows[0]
    if (!profile) throw new HttpError(401, 'Please sign in.')
    const stale = body.baseRevision !== profile.revision
    const { upsert, remove } = body

    const empty = !body.profile && KINDS.every((k) => upsert[k].length === 0 && remove[k].length === 0)
    if (empty) return { revision: profile.revision, data: stale ? await loadData(t, userId) : null, noteCopies: {} }

    const revision = profile.revision + 1
    /** True once we store something other than what was sent. */
    let adjusted = false

    // The text of notes in this save, as stored now.
    const noteIds = [...upsert.notes.map((n) => n.id), ...remove.notes]
    const saved = new Map<string, SavedNote>()
    if (noteIds.length) {
      const found = await t.query<SavedNote>(
        'SELECT id, title, body, text_revision, text_client FROM notes WHERE user_id = $1 AND id = ANY($2::text[])',
        [userId, noteIds],
      )
      for (const n of found.rows) saved.set(n.id, n)
    }
    const changedElsewhere = (n: SavedNote) => n.text_revision > body.baseRevision && n.text_client !== body.clientId

    // 1. Remove. A note that another device has just edited stays.
    for (const kind of [...KINDS].reverse()) {
      const kept = new Set(upsert[kind].map((r) => r.id))
      const gone = remove[kind].filter((id) => {
        if (kept.has(id)) return false
        const note = kind === 'notes' ? saved.get(id) : undefined
        if (!note || !changedElsewhere(note)) return true
        adjusted = true
        return false
      })
      if (gone.length) await t.query(`DELETE FROM ${TABLES[kind].table} WHERE user_id = $1 AND id = ANY($2::text[])`, [userId, gone])
    }

    // 2. Courses, then everything that can point at them.
    await upsertAll(t, userId, 'courses', upsert.courses)
    const courses = await existingIds(t, userId, 'courses', [...upsert.sessions, ...upsert.tasks, ...upsert.notes, ...upsert.components])
    const hasCourse = (r: { courseId: string | null }) => r.courseId !== null && courses.has(r.courseId)

    /** Classes and grade components mean nothing without their course. */
    const withCourse = <T extends { courseId: string }>(list: T[]): T[] => {
      const kept = list.filter(hasCourse)
      if (kept.length !== list.length) adjusted = true
      return kept
    }
    /** Tasks and notes outlive their course. */
    const unlinkCourse = <T extends { courseId: string | null }>(r: T): T => {
      if (r.courseId === null || hasCourse(r)) return r
      adjusted = true
      return { ...r, courseId: null }
    }

    await upsertAll(t, userId, 'sessions', withCourse(upsert.sessions))
    await upsertAll(t, userId, 'components', withCourse(upsert.components))

    const tasks = await withoutDuplicateImports(t, userId, upsert.tasks)
    if (tasks.length !== upsert.tasks.length) adjusted = true
    await upsertAll(t, userId, 'tasks', tasks.map(unlinkCourse))

    // 3. Notes.
    const sessions = await existingIds(t, userId, 'sessions', upsert.notes)
    const noteCopies: Record<string, string> = {}
    const notes: Json[] = []
    for (const sent of upsert.notes) {
      const old = saved.get(sent.id)
      let note = unlinkCourse(sent)
      if (note.sessionId !== null && !sessions.has(note.sessionId)) {
        adjusted = true
        note = { ...note, sessionId: null }
      }
      if (note.sessionId === null) note = { ...note, sessionDate: null }

      if (note.title === undefined || note.body === undefined) {
        // Only the links changed. If the note is gone, there is nothing left to link.
        if (old) notes.push({ ...note, title: old.title, body: old.body, textRevision: old.text_revision, textClient: old.text_client })
        else adjusted = true
        continue
      }
      const text = { textRevision: revision, textClient: body.clientId }
      if (old && changedElsewhere(old) && (old.title !== note.title || old.body !== note.body)) {
        // Two devices edited this note at once. Keep both. The id is the same if this save is retried.
        const copyId = `n_${createHash('sha256').update(`${sent.id}\n${body.clientId}\n${body.baseRevision}`).digest('hex').slice(0, 24)}`
        noteCopies[sent.id] = copyId
        adjusted = true
        notes.push({
          ...note,
          ...text,
          id: copyId,
          // By character, so an emoji is never cut in half.
          title: `${[...(note.title || 'Untitled note')].slice(0, 250).join('')} (copy)`,
        })
      } else {
        notes.push({ ...note, ...text })
      }
    }
    await upsertAll(t, userId, 'notes', notes)

    // 4. Settings, and the new revision.
    const next = body.profile ?? {}
    const scale = next.scale === undefined ? profile.grade_scale : next.scale
    const prior = next.prior ?? { cgpa: profile.prior_cgpa, units: profile.prior_units }
    await t.query(
      `UPDATE student_profiles
          SET revision = $2, display_name = $3, is_demo = $4, banner_dismissed = $5, grade_scale = $6::jsonb,
              prior_cgpa = $7, prior_units = $8, updated_at = now()
        WHERE user_id = $1`,
      [
        userId,
        revision,
        next.name ?? profile.display_name,
        next.isDemo ?? profile.is_demo,
        next.bannerDismissed ?? profile.banner_dismissed,
        scale === null ? null : JSON.stringify(scale),
        prior.cgpa,
        prior.units,
      ],
    )

    await enforceQuotas(t, userId)
    return { revision, data: stale || adjusted ? await loadData(t, userId) : null, noteCopies }
  })
}

/** Inserts or replaces many records in one statement. */
async function upsertAll(t: Queryable, userId: string, kind: Kind, list: readonly object[]): Promise<void> {
  if (list.length === 0) return
  const { table } = TABLES[kind]
  const columns: Column[] = [...TABLES[kind].columns, ...(kind === 'notes' ? NOTE_INTERNAL : []), ['bytes', 'bytes', 'integer']]
  const names = columns.map(([, column]) => column)
  const rows = list.map((r) => ({ ...r, bytes: Buffer.byteLength(JSON.stringify(r)) }))
  await t.query(
    `INSERT INTO ${table} (user_id, ${names.join(', ')})
     SELECT $1, ${columns.map(([key]) => `r."${key}"`).join(', ')}
       FROM ROWS FROM (jsonb_to_recordset($2::jsonb) AS (${columns.map(([key, , type]) => `"${key}" ${type}`).join(', ')})) WITH ORDINALITY AS r
      ORDER BY r.ordinality
     ON CONFLICT (user_id, id) DO UPDATE SET ${names
       .filter((c) => c !== 'id')
       .map((c) => `${c} = excluded.${c}`)
       .join(', ')}`,
    [userId, JSON.stringify(rows)],
  )
}

/** Which of the student's courses (or classes) these records point at really exist. */
async function existingIds(
  t: Queryable,
  userId: string,
  kind: 'courses' | 'sessions',
  list: readonly { courseId?: string | null; sessionId?: string | null }[],
): Promise<Set<string>> {
  const key = kind === 'courses' ? 'courseId' : 'sessionId'
  const wanted = [...new Set(list.map((r) => r[key]).filter((v): v is string => typeof v === 'string'))]
  if (wanted.length === 0) return new Set()
  const { rows } = await t.query<{ id: string }>(`SELECT id FROM ${TABLES[kind].table} WHERE user_id = $1 AND id = ANY($2::text[])`, [
    userId,
    wanted,
  ])
  return new Set(rows.map((r) => r.id))
}

/** Drops imported tasks that are already in the account under another id. */
async function withoutDuplicateImports(t: Queryable, userId: string, tasks: SaveBody['upsert']['tasks']) {
  const external = [...new Set(tasks.map((x) => x.externalId).filter((v): v is string => v !== null))]
  if (external.length === 0) return tasks
  const { rows } = await t.query<{ id: string; external_id: string }>(
    'SELECT id, external_id FROM tasks WHERE user_id = $1 AND external_id = ANY($2::text[])',
    [userId, external],
  )
  const owner = new Map(rows.map((r) => [r.external_id, r.id]))
  return tasks.filter((x) => {
    if (x.externalId === null) return true
    const has = owner.get(x.externalId)
    if (has === undefined) owner.set(x.externalId, x.id)
    return has === undefined || has === x.id
  })
}

const NOUNS: Record<Kind, string> = {
  courses: 'courses',
  sessions: 'classes',
  tasks: 'tasks',
  notes: 'notes',
  components: 'grade components',
}

async function enforceQuotas(t: Queryable, userId: string): Promise<void> {
  const { rows } = await t.query<{ kind: Kind; n: number; bytes: number }>(
    KINDS.map(
      (kind) => `SELECT '${kind}' AS kind, count(*)::int AS n, COALESCE(sum(bytes), 0)::int AS bytes FROM ${TABLES[kind].table} WHERE user_id = $1`,
    ).join(' UNION ALL '),
    [userId],
  )
  for (const { kind, n } of rows) {
    if (n > QUOTAS[kind]) {
      throw new HttpError(422, `An account can hold up to ${QUOTAS[kind].toLocaleString('en-US')} ${NOUNS[kind]}. Delete some to save more.`)
    }
  }
  if (rows.reduce((sum, r) => sum + r.bytes, 0) > QUOTAS.bytes) {
    throw new HttpError(422, 'Your account is full. Delete some notes or tasks to save more.')
  }
}
