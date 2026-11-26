import { createHash } from 'node:crypto'
import { KEEP_IF_MISSING, QUOTAS, type Kind, type SaveBody } from './dataSchema.ts'
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
      ['startsOn', 'starts_on', 'text'],
      ['endsOn', 'ends_on', 'text'],
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
      ['category', 'category', 'text'],
      ['progress', 'progress', 'text'],
      ['estimate', 'estimate', 'integer'],
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
      ['totalScore', 'total_score', 'double precision'],
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
    taskMode: string | null
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
  task_mode: string | null
  grade_scale: StudentData['profile']['scale']
  prior_cgpa: number | null
  prior_units: number | null
}

/** One SELECT for everything, so it is one consistent moment and one round trip. */
const LOAD = `SELECT p.revision, p.display_name, p.is_demo, p.banner_dismissed, p.task_mode, p.grade_scale, p.prior_cgpa, p.prior_units,
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
      taskMode: p?.task_mode ?? null,
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

/** The most save-order records kept per student. Older ones are forgotten, never the one just written. */
export const MAX_SYNC_CLIENTS = 500

/** How long a save may wait or run before the database gives up, so a stuck one cannot hold a connection past the host's own limit. */
export interface SaveTimeouts {
  lock: string
  statement: string
  idleInTransaction: string
}
export const DEFAULT_SAVE_TIMEOUTS: SaveTimeouts = { lock: '5s', statement: '10s', idleInTransaction: '15s' }

/** Applies a whole save, or none of it. Saves for one student take turns. */
export async function saveData(
  db: Db,
  userId: string,
  body: SaveBody,
  sequence?: number,
  timeouts: SaveTimeouts = DEFAULT_SAVE_TIMEOUTS,
): Promise<SaveResult> {
  try {
    return await saveInTransaction(db, userId, body, sequence, timeouts)
  } catch (err) {
    // Only "waited too long for a lock" and "ran too long": the save did not happen, and trying again is safe.
    const code = (err as { code?: unknown })?.code
    if (code === '55P03' || code === '57014') {
      throw new HttpError(503, 'The server is busy. Trying again shortly.', { retryAfter: 5 })
    }
    throw err
  }
}

async function saveInTransaction(db: Db, userId: string, body: SaveBody, sequence: number | undefined, timeouts: SaveTimeouts): Promise<SaveResult> {
  return db.tx(async (t) => {
    // First, so every statement below is covered. Local to this transaction, so nothing leaks to the next user of the connection.
    await t.query(
      `SELECT set_config('lock_timeout', $1, true), set_config('statement_timeout', $2, true),
              set_config('idle_in_transaction_session_timeout', $3, true)`,
      [timeouts.lock, timeouts.statement, timeouts.idleInTransaction],
    )
    // FOR KEY SHARE waits for an account deletion in progress, and then finds nobody.
    await t.query(
      `INSERT INTO student_profiles (user_id) SELECT id FROM users WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM student_profiles WHERE user_id = $1)
         FOR KEY SHARE ON CONFLICT DO NOTHING`,
      [userId],
    )
    const { rows } = await t.query<ProfileRow>('SELECT * FROM student_profiles WHERE user_id = $1 FOR UPDATE', [userId])
    const profile = rows[0]
    if (!profile) throw new HttpError(401, 'Please sign in.')
    if (sequence !== undefined) {
      // Every page load is a new client, so forget the ones this student has not used for a month.
      await t.query(`DELETE FROM sync_client_sequences WHERE user_id = $1 AND touched_at < now() - interval '30 days'`, [userId])
      const accepted = await t.query(
        `INSERT INTO sync_client_sequences (user_id, client_id, sequence) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, client_id) DO UPDATE SET sequence = EXCLUDED.sequence, touched_at = now()
         WHERE sync_client_sequences.sequence < EXCLUDED.sequence RETURNING sequence`,
        [userId, body.clientId, sequence],
      )
      if (!accepted.rows.length) return { revision: profile.revision, data: await loadData(t, userId), noteCopies: {} }
      // Every page load is a new client id, so bound the table. Only after the upsert above, so this save's own record stays.
      await t.query(
        `DELETE FROM sync_client_sequences WHERE user_id = $1 AND client_id IN (
           SELECT client_id FROM sync_client_sequences WHERE user_id = $1 ORDER BY touched_at DESC, client_id OFFSET $2) AND client_id <> $3`,
        [userId, MAX_SYNC_CLIENTS, body.clientId],
      )
    }
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

    const sessions_ = await keepMissing(t, userId, 'class_sessions', withCourse(upsert.sessions), KEEP_IF_MISSING.sessions)
    // Kept dates are something other than what was sent, so the sender gets the saved version back.
    if (sessions_.kept) adjusted = true
    await upsertAll(t, userId, 'sessions', sessions_.list)
    const components = await keepTotals(t, userId, withCourse(upsert.components))
    // A kept total is something other than what was sent, so the sender gets the saved version back.
    if (components.kept) adjusted = true
    await upsertAll(t, userId, 'components', components.list)

    const tasks = await withoutDuplicateImports(t, userId, upsert.tasks)
    if (tasks.length !== upsert.tasks.length) adjusted = true
    const tasks_ = await keepMissing(t, userId, 'tasks', tasks, KEEP_IF_MISSING.tasks)
    if (tasks_.kept) adjusted = true
    // A to-do is never an exam. An older app turning an exam into a to-do leaves the category out,
    // so the kept one is dropped here, and the sender gets the saved version back.
    const taskList = tasks_.list.map((r) => {
      if (r.kind !== 'todo' || (r as { category?: unknown }).category == null) return r
      adjusted = true
      return { ...r, category: null }
    })
    await upsertAll(t, userId, 'tasks', taskList.map(unlinkCourse))

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
              prior_cgpa = $7, prior_units = $8, task_mode = $9, updated_at = now()
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
        next.taskMode === undefined ? profile.task_mode : next.taskMode,
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

/**
 * Fields an older app does not know about keep what is saved when it leaves them out. Apps
 * before 1.9.0 never send a class's term dates or a task's category, and an edit from such an
 * app must not bring an ended class back into every week or turn an exam into an assignment.
 * Clearing a field is an explicit null. `kept` says whether anything saved was filled in, so
 * the sender gets the saved version back.
 */
async function keepMissing<T extends { id: string }>(
  t: Queryable,
  userId: string,
  table: 'class_sessions' | 'tasks',
  list: T[],
  fields: readonly (readonly [string, string])[],
): Promise<{ list: T[]; kept: boolean }> {
  const value = (r: T, key: string) => (r as Record<string, unknown>)[key]
  const missing = list.filter((r) => fields.some(([key]) => value(r, key) === undefined)).map((r) => r.id)
  if (missing.length === 0) return { list, kept: false }
  // Table and column names come from the fixed lists above, never from a request.
  const { rows } = await t.query<Record<string, unknown> & { id: string }>(
    `SELECT id, ${fields.map(([, col]) => col).join(', ')} FROM ${table} WHERE user_id = $1 AND id = ANY($2::text[])`,
    [userId, missing],
  )
  const saved = new Map(rows.map((r) => [r.id, r]))
  let kept = false
  const out = list.map((r) => {
    const was = saved.get(r.id)
    const next: Record<string, unknown> = { ...r }
    for (const [key, col] of fields) {
      if (value(r, key) !== undefined) continue
      next[key] = was?.[col] ?? null
      if (next[key] !== null) kept = true
    }
    return next as T
  })
  return { list: out, kept }
}

/**
 * A component sent without totalScore keeps the total it already has. Apps before 1.7.0 never
 * send one, and a rename from such an app must not turn 42/50 into 42/100. Clearing a total
 * is an explicit null.
 */
async function keepTotals<T extends { id: string; totalScore?: number | null }>(
  t: Queryable,
  userId: string,
  list: T[],
): Promise<{ list: T[]; kept: boolean }> {
  const missing = list.filter((c) => c.totalScore === undefined).map((c) => c.id)
  if (missing.length === 0) return { list, kept: false }
  const { rows } = await t.query<{ id: string; total_score: number | null }>(
    'SELECT id, total_score FROM grade_components WHERE user_id = $1 AND id = ANY($2::text[])',
    [userId, missing],
  )
  const saved = new Map(rows.map((r) => [r.id, r.total_score]))
  return {
    list: list.map((c) => (c.totalScore === undefined ? { ...c, totalScore: saved.get(c.id) ?? null } : c)),
    kept: rows.some((r) => r.total_score !== null),
  }
}
