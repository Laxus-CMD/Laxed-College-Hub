import { z } from 'zod'

/**
 * The shape of a save. Limits are looser than the forms on purpose: one odd
 * value (a half-typed number, a long calendar title) must not block a student
 * from saving everything else. Unknown keys inside records are dropped.
 */

/** How much one account can hold. */
export const QUOTAS = {
  courses: 200,
  sessions: 500,
  tasks: 5000,
  notes: 3000,
  components: 3000,
  /** Everything together as JSON. Vercel cannot answer with more than 4.5 MB. */
  bytes: 3_000_000,
}

export const MAX_NOTE_CHARS = 100_000

/** Postgres cannot store NUL characters or half of an emoji, and both can come from pasted or cut-off text. */
const clean = (s: string) => s.replaceAll('\0', '').replace(/\p{Surrogate}/gu, '�')

const text = (max: number) => z.string().transform(clean).pipe(z.string().max(max, `Must be ${max} characters or fewer.`))
/** Optional fields may be missing or null. Both are stored as null. */
const maybe = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? null)
const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Bad id.')
const number = z.number().min(-1e6).max(1e6)
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Bad time.')
const date = z.string().regex(/^\d{4,6}-\d{2}-\d{2}$/, 'Bad date.')
const dueDate = z.string().regex(/^\d{4,6}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Bad date.')
const stamp = z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString())

const course = z.object({
  id,
  code: text(100),
  name: text(300),
  units: number,
  color: z.string().regex(/^[#A-Za-z0-9-]{1,32}$/, 'Bad color.'),
  professor: maybe(text(300)),
  professorEmail: maybe(text(300)),
  officeHours: maybe(text(300)),
  /** A grade point picked by hand. */
  override: maybe(number),
  /** The grade point the student is aiming for. */
  target: maybe(number),
})

const session = z.object({
  id,
  courseId: id,
  days: z
    .array(z.number().int().min(0).max(6))
    .max(50)
    .transform((d) => [...new Set(d)]),
  start: time,
  end: time,
  room: maybe(text(300)),
  building: maybe(text(300)),
})

const task = z.object({
  id,
  kind: z.enum(['assignment', 'todo']),
  title: text(1000),
  courseId: maybe(id),
  due: maybe(dueDate),
  done: z.boolean(),
  weight: maybe(number),
  source: z.enum(['manual', 'ics']),
  externalId: maybe(text(500)).transform((v) => v || null),
})

const note = z
  .object({
    id,
    /** Leave out both title and body when only the links changed. */
    title: text(300).optional(),
    body: text(MAX_NOTE_CHARS).optional(),
    courseId: maybe(id),
    sessionId: maybe(id),
    sessionDate: maybe(date),
    createdAt: stamp,
    updatedAt: stamp,
  })
  .refine((n) => (n.title === undefined) === (n.body === undefined), 'Send the title and body together.')

const component = z.object({
  id,
  courseId: id,
  name: text(300),
  weight: number,
  score: maybe(number),
  totalScore: maybe(number.positive()),
})

/** Keeps the last of any records with the same id. */
const records = <T extends z.ZodType<{ id: string }>>(schema: T, max: number) =>
  z
    .array(schema)
    .max(max, `No more than ${max} at once.`)
    .default([])
    .transform((list) => [...new Map(list.map((r) => [r.id, r])).values()])

const ids = (max: number) => z.array(id).max(max).default([])

export const saveBody = z.strictObject({
  /**
   * The account this tab is showing. It never chooses whose data is saved: it only has to match the
   * session, because another tab may have signed in to someone else and all tabs share one cookie.
   */
  accountId: z.uuid('Bad account id.'),
  /** One browser tab. Tells a retry of our own save from another device's save. */
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Bad client id.'),
  /** The revision the changes were made on top of. */
  baseRevision: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1),
  upsert: z
    .strictObject({
      courses: records(course, QUOTAS.courses),
      sessions: records(session, QUOTAS.sessions),
      tasks: records(task, QUOTAS.tasks),
      notes: records(note, QUOTAS.notes),
      components: records(component, QUOTAS.components),
    })
    .prefault({}),
  remove: z
    .strictObject({
      courses: ids(QUOTAS.courses),
      sessions: ids(QUOTAS.sessions),
      tasks: ids(QUOTAS.tasks),
      notes: ids(QUOTAS.notes),
      components: ids(QUOTAS.components),
    })
    .prefault({}),
  profile: z
    .strictObject({
      name: text(60).optional(),
      isDemo: z.boolean().optional(),
      bannerDismissed: z.boolean().optional(),
      /** Null goes back to the default scale. */
      scale: z.array(z.object({ grade: number, min: number })).max(20).nullable().optional(),
      prior: z.object({ cgpa: number.nullable(), units: number.nullable() }).optional(),
    })
    .optional(),
})

export type SaveBody = z.output<typeof saveBody>
export type Kind = keyof SaveBody['upsert']

export const loadQuery = z.object({ since: z.coerce.number().int().min(0).optional() })
