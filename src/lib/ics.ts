import type { Course, TaskKind } from '@/types'
import { pad2, toLocalIso } from '@/lib/time'

/** One deadline pulled out of a calendar file. */
export interface IcsItem {
  /** UID from the file, or a fallback built from title and date. */
  externalId: string
  title: string
  /** Local "YYYY-MM-DDTHH:mm". */
  due: string
  /** Text from a trailing "[...]" in the title. Canvas puts the course code there. */
  courseHint?: string
  description?: string
  kind: TaskKind
  allDay: boolean
}

export interface ParseIcsOptions {
  /**
   * Fixed offset from UTC in minutes, for example 480 for UTC+8.
   * Leave it out to use the viewer's own time zone.
   */
  offsetMinutes?: number
}

interface RawProp {
  name: string
  params: Record<string, string>
  value: string
}

/** Joins folded lines. In iCal, a line starting with a space continues the one before. */
export function unfoldLines(text: string): string[] {
  const out: string[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

function valueColon(line: string): number {
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) return i
  }
  return -1
}

function parseProp(line: string): RawProp | null {
  const idx = valueColon(line)
  if (idx < 0) return null
  const [rawName = '', ...rawParams] = line.slice(0, idx).split(';')
  const params: Record<string, string> = {}
  for (const p of rawParams) {
    const eq = p.indexOf('=')
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '')
  }
  return { name: rawName.trim().toUpperCase(), params, value: line.slice(idx + 1) }
}

function unescapeText(s: string): string {
  return s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c))
}

function parseDate(
  prop: RawProp,
  offsetMinutes: number | undefined,
): { local: string; allDay: boolean } | null {
  const v = prop.value.trim()
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v)
  if (dateOnly) {
    return { local: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}T23:59`, allDay: true }
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v)
  if (!m) return null
  const [, y = '', mo = '', d = '', h = '', mi = '', s = '00', z] = m
  if (!z) return { local: `${y}-${mo}-${d}T${h}:${mi}`, allDay: false } // floating or TZID: taken as local time
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  if (offsetMinutes === undefined) return { local: toLocalIso(new Date(utc)), allDay: false }
  const t = new Date(utc + offsetMinutes * 60_000)
  return {
    local: `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}T${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`,
    allDay: false,
  }
}

function toItem(type: string, props: RawProp[], options: ParseIcsOptions): IcsItem | null {
  const get = (name: string) => props.find((p) => p.name === name)
  const summary = get('SUMMARY')
  const startProp = type === 'VTODO' ? (get('DUE') ?? get('DTSTART')) : get('DTSTART')
  if (!summary || !startProp) return null
  const when = parseDate(startProp, options.offsetMinutes)
  if (!when) return null

  let title = unescapeText(summary.value).trim()
  let courseHint: string | undefined
  const tag = /\s*\[([^\]]+)\]\s*$/.exec(title)
  if (tag) {
    courseHint = tag[1]?.trim()
    title = title.slice(0, tag.index).trim()
  }
  if (!title) return null

  const uid = get('UID')?.value.trim()
  const desc = get('DESCRIPTION')
  const description = desc ? unescapeText(desc.value).trim().slice(0, 400) : undefined
  return {
    externalId: uid || `${title}|${when.local}`,
    title,
    due: when.local,
    courseHint,
    description: description || undefined,
    kind: type === 'VTODO' || /calendar-event/i.test(uid ?? '') ? 'todo' : 'assignment',
    allDay: when.allDay,
  }
}

/** Reads deadlines from the text of an .ics file. Events and to-dos both count. */
export function parseIcs(text: string, options: ParseIcsOptions = {}): IcsItem[] {
  const items: IcsItem[] = []
  let type: string | null = null
  let props: RawProp[] = []
  let nested = 0 // depth inside things like VALARM, whose properties we ignore

  for (const line of unfoldLines(text)) {
    const upper = line.trim().toUpperCase()
    if (!type) {
      if (upper === 'BEGIN:VEVENT' || upper === 'BEGIN:VTODO') {
        type = upper.slice(6)
        props = []
        nested = 0
      }
      continue
    }
    if (upper === `END:${type}` && nested === 0) {
      const item = toItem(type, props, options)
      if (item) items.push(item)
      type = null
      continue
    }
    if (upper.startsWith('BEGIN:')) {
      nested++
      continue
    }
    if (upper.startsWith('END:')) {
      nested = Math.max(0, nested - 1)
      continue
    }
    if (nested === 0) {
      const prop = parseProp(line)
      if (prop) props.push(prop)
    }
  }
  return items.sort((a, b) => a.due.localeCompare(b.due))
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Finds the course a calendar hint points at, like "FNDSTAT-A" to course FNDSTAT. */
export function matchCourse(hint: string | undefined, courses: Course[]): Course | undefined {
  if (!hint) return undefined
  const h = squash(hint)
  if (!h) return undefined
  let best: Course | undefined
  for (const course of courses) {
    const code = squash(course.code)
    if (!code || !h.includes(code)) continue
    if (!best || code.length > squash(best.code).length) best = course
  }
  return best
}
