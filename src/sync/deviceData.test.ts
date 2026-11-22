import { beforeEach, describe, expect, it } from 'vitest'
import { makeDemoData } from '@/data/demo'
import { resetStores } from '@/test/seed'
import { clearAllData } from '@/store/actions'
import { useGradeStore } from '@/store/useGradeStore'
import { useNoteStore } from '@/store/useNoteStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { backupText, clearDeviceData, hasOwnData, mergeImport, parseBackup, readDeviceDoc, toDoc, withoutUntouchedSample } from '@/sync/deviceData'
import { cleanDoc, docsEqual, KINDS, MAX_NOTE_CHARS, readStores, type Doc } from '@/sync/doc'

const AT = '2026-11-22T03:00:00.000Z'
const empty: Doc = {
  profile: { name: 'Juan', isDemo: false, bannerDismissed: false, scale: null, prior: { cgpa: null, units: null } },
  courses: [], sessions: [], tasks: [], notes: [], components: [],
}
const course = (id: string, code: string, name = '', extra = {}) => ({ id, code, name, units: 3, color: '#4fd1c5', ...extra })
const session = (id: string, courseId: string, start = '09:15') => ({ id, courseId, days: [1, 4] as (1 | 4)[], start, end: '10:45' })
const task = (id: string, title: string, extra = {}) => ({ id, kind: 'todo' as const, title, done: false, source: 'manual' as const, ...extra })
const note = (id: string, body: string, extra = {}) => ({ id, title: 'Note', body, createdAt: AT, updatedAt: AT, ...extra })
const component = (id: string, courseId: string, name: string, score: number | null = null) => ({ id, courseId, name, weight: 30, score })
const doc = (d: Partial<Doc>): Doc => cleanDoc({ ...empty, ...d })

beforeEach(() => {
  localStorage.clear()
  // Made weeks ago, so every sample date differs from today's.
  resetStores(new Date(2026, 9, 1))
})
const own = () => withoutUntouchedSample(readDeviceDoc()!)

describe('reading this browser', () => {
  it('finds nothing in a browser that was never used', () => {
    localStorage.clear()
    expect(readDeviceDoc()).toBeNull()
  })

  it('reads exactly what the guest has', () => {
    clearAllData()
    const id = useScheduleStore.getState().addCourse(course('', 'CS 1'))
    useGradeStore.getState().setOverride(id, 3.5)
    useGradeStore.getState().setTarget(id, 4)
    useGradeStore.getState().setPrior({ cgpa: 3.2, units: 30 })
    useNoteStore.getState().addNote({ title: 'T', body: 'B', courseId: id })
    expect(readDeviceDoc()).toEqual(readStores())
    expect(readDeviceDoc()!.courses[0]).toMatchObject({ override: 3.5, target: 4 })
  })

  it('survives damaged or made-up data', () => {
    for (const key of ['grades', 'settings']) localStorage.setItem(`college-hub.${key}`, '[]')
    localStorage.setItem('college-hub.tasks', '{oops')
    localStorage.setItem('college-hub.notes', JSON.stringify({ state: { notes: 'x' } }))
    localStorage.setItem('college-hub.schedule', JSON.stringify({ state: { courses: [null, 5, { id: 7 }, { id: 'c1', code: 9, color: 'url(x)' }], sessions: [{ id: 's1', courseId: 'c1', days: null }] } }))
    const d = readDeviceDoc()!
    expect(d.tasks).toEqual([])
    expect(d.notes).toEqual([])
    expect(d.courses).toEqual([{ id: 'c1', code: '', name: '', units: 0, color: '#8e8e93' }])
    expect(d.sessions[0]!.days).toEqual([])
  })

  it('splits a note that is too long instead of cutting it', () => {
    const body = '😀'.repeat(MAX_NOTE_CHARS) // Twice the limit, with no safe odd split point.
    const { notes } = toDoc({ notes: [note('n1', `x${body}`)] })
    expect(notes).toHaveLength(3)
    expect(notes.map((n) => n.body).join('')).toBe(`x${body}`)
    expect(notes.every((n) => n.body.length <= MAX_NOTE_CHARS)).toBe(true)
    expect(notes[1]!.title).toBe('Note (part 2)')
    expect(new Set(notes.map((n) => n.id)).size).toBe(3)
  })

  it('clears guest data only, and keeps the theme', () => {
    localStorage.setItem('college-hub.theme', '{}')
    clearDeviceData()
    expect(readDeviceDoc()).toBeNull()
    expect(localStorage.getItem('college-hub.theme')).toBe('{}')
    expect(localStorage.getItem('college-hub.auth')).not.toBeNull()
  })
})

describe('sample data', () => {
  it('is ignored when nobody touched it, whatever day it was made', () => {
    expect(hasOwnData(own())).toBe(false)
    // Trying things out does not count.
    useTaskStore.getState().toggleTask('t-bst')
    expect(hasOwnData(own())).toBe(false)
  })

  it('keeps a student\'s own records and drops the sample around them', () => {
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Mine' })
    expect(own()).toMatchObject({ courses: [], sessions: [], notes: [], components: [], tasks: [{ title: 'Mine' }] })
  })

  it('is recognised when the browser only saved the part that changed', () => {
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Mine', courseId: 'c-cs101' })
    for (const key of ['schedule', 'notes', 'grades', 'settings']) localStorage.removeItem(`college-hub.${key}`)
    const d = own()
    expect(d.tasks.map((t) => t.title)).toEqual(['Mine'])
    expect(d.courses.map((c) => c.id)).toEqual(['c-cs101'])
    expect(d.notes).toEqual([])
  })

  it('keeps a whole sample course once it is used for real', () => {
    useGradeStore.getState().updateComponent('g-cs-4', { score: 91 })
    useNoteStore.getState().updateNote('n-ibp', { body: 'my own notes' })
    const d = own()
    expect(d.courses.map((c) => c.id)).toEqual(['c-cs101', 'c-math201'])
    expect(d.components.filter((c) => c.courseId === 'c-cs101')).toHaveLength(4)
    expect(d.sessions.map((s) => s.id)).toEqual(['s-cs101', 's-math201'])
    expect(d.notes.map((n) => n.id)).toEqual(['n-ibp'])
    expect(d.tasks).toEqual([])
  })

  it('counts edits to a sample course, like a target grade', () => {
    useGradeStore.getState().setTarget('c-phys150', 3)
    expect(own().courses.map((c) => c.id)).toEqual(['c-phys150'])
  })

  it('is kept when the student said it is not sample data', () => {
    const d = doc({ ...makeDemoData(new Date()) })
    expect(withoutUntouchedSample(d)).toBe(d)
  })
})

describe('merging into the account', () => {
  it('adds everything to an empty account, unchanged', () => {
    const from = doc({
      courses: [course('c1', 'CS 1', 'Intro', { override: 3.5 })],
      sessions: [session('s1', 'c1')],
      tasks: [task('t1', 'Read', { courseId: 'c1' })],
      notes: [note('n1', 'b', { courseId: 'c1', sessionId: 's1', sessionDate: '2026-11-19' })],
      components: [component('g1', 'c1', 'Exam', 88)],
    })
    const m = mergeImport(empty, from)
    expect(docsEqual(m.doc, from)).toBe(true)
    expect(m).toMatchObject({ anything: true, skipped: 0, added: { courses: 1, sessions: 1, tasks: 1, notes: 1, components: 1 } })
  })

  it('does nothing the second time', () => {
    const from = doc({ courses: [course('c1', 'CS 1')], tasks: [task('t1', 'Read')], notes: [note('n1', 'b')], components: [component('g1', 'c1', 'Exam')] })
    const once = mergeImport(empty, from).doc
    expect(mergeImport(once, from)).toMatchObject({ anything: false, skipped: 4 })
  })

  it('counts a detail that is only filled in, so the browser copy is not called a duplicate', () => {
    const m = mergeImport(doc({ courses: [course('c1', 'CS 1')] }), doc({ courses: [course('c1', 'CS 1', '', { target: 4 })] }))
    expect(m.anything).toBe(true)
    expect(m.doc.courses[0]).toMatchObject({ target: 4 })
  })

  it('never changes or removes what the account has', () => {
    const account = doc({
      courses: [course('c1', 'CS 1', 'Account name', { target: 4 })],
      sessions: [session('s1', 'c1')],
      tasks: [task('t1', 'Account title', { done: true })],
      notes: [note('n1', 'account text')],
      components: [component('g1', 'c1', 'Exam', 90)],
    })
    const from = doc({
      courses: [course('c1', 'OTHER', 'Browser name', { target: 1, professor: 'Reyes' })],
      sessions: [session('s1', 'c1', '13:00')],
      tasks: [task('t1', 'Browser title')],
      notes: [note('n1', 'browser text')],
      components: [component('g1', 'c1', 'Exam', 10)],
    })
    const { doc: out } = mergeImport(account, from)
    for (const k of KINDS) {
      for (const r of account[k]) expect(out[k].find((x) => x.id === r.id)).toMatchObject(r)
    }
    // Empty fields are filled in, and the other note text is kept next to it.
    expect(out.courses[0]).toMatchObject({ professor: 'Reyes', target: 4 })
    expect(out.notes.map((n) => n.body)).toEqual(['account text', 'browser text'])
    expect(new Set(out.notes.map((n) => n.id)).size).toBe(2)
  })

  it('joins the same course typed on two devices, with everything in it', () => {
    const account = doc({ courses: [course('a1', 'CS 101', 'Data Structures')], sessions: [session('as', 'a1')], components: [component('ag', 'a1', 'Midterm', 80)] })
    const from = doc({
      courses: [course('b1', ' cs  101 ', 'data structures')],
      sessions: [session('bs', 'b1'), session('bs2', 'b1', '13:00')],
      components: [component('bg', 'b1', 'midterm', 80), component('bg2', 'b1', 'Final')],
      tasks: [task('bt', 'Lab', { courseId: 'b1' })],
      notes: [note('bn', 'x', { courseId: 'b1', sessionId: 'bs', sessionDate: '2026-11-19' })],
    })
    const { doc: out, added } = mergeImport(account, from)
    expect(out.courses).toHaveLength(1)
    expect(out.sessions.map((s) => [s.id, s.courseId])).toEqual([['as', 'a1'], ['bs2', 'a1']])
    expect(out.components.map((c) => [c.id, c.courseId])).toEqual([['ag', 'a1'], ['bg2', 'a1']])
    expect(out.tasks[0]).toMatchObject({ courseId: 'a1' })
    expect(out.notes[0]).toMatchObject({ courseId: 'a1', sessionId: 'as', sessionDate: '2026-11-19' })
    expect(added).toEqual({ courses: 0, sessions: 1, tasks: 1, notes: 1, components: 1 })
  })

  it('keeps courses apart when the name says they differ', () => {
    const { doc: out } = mergeImport(doc({ courses: [course('a1', 'ELEC', 'Film')] }), doc({ courses: [course('b1', 'ELEC', 'Music')] }))
    expect(out.courses).toHaveLength(2)
  })

  it('skips a calendar task the account imported too', () => {
    const { doc: out } = mergeImport(
      doc({ tasks: [task('a', 'Quiz', { externalId: 'uid-1' })] }),
      doc({ tasks: [task('b', 'Quiz renamed', { externalId: 'uid-1' }), task('c', 'New')] }),
    )
    expect(out.tasks.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('drops links to things that are not there', () => {
    const { doc: out } = mergeImport(empty, doc({ tasks: [task('t', 'x', { courseId: 'gone' })], notes: [note('n', 'x', { courseId: 'gone', sessionId: 'gone', sessionDate: '2026-01-01' })], sessions: [session('s', 'gone')] }))
    expect(out.tasks[0]).not.toHaveProperty('courseId')
    expect(out.notes[0]).not.toHaveProperty('sessionDate')
    expect(out.sessions).toEqual([])
  })

  it('fills in GPA settings only where the account has none', () => {
    const from = doc({ profile: { ...empty.profile, name: 'Other', scale: [{ grade: 4, min: 96 }], prior: { cgpa: 3.4, units: 36 } } })
    expect(mergeImport(empty, from).doc.profile).toMatchObject({ name: 'Juan', scale: [{ grade: 4, min: 96 }], prior: { cgpa: 3.4, units: 36 } })
    const set = doc({ profile: { ...empty.profile, scale: [{ grade: 4, min: 90 }], prior: { cgpa: 2, units: 3 } } })
    expect(mergeImport(set, from)).toMatchObject({ anything: false })
  })
})

describe('backup files', () => {
  it('come back exactly as they were', () => {
    const before = readStores()
    expect(parseBackup(backupText(before))).toEqual(before)
  })

  it('are refused when they are something else', () => {
    for (const text of ['', 'hello', '[]', 'null', '{"app":"other","version":1}', '{"app":"college-hub","version":2}']) expect(parseBackup(text)).toBeNull()
  })

  it('cannot smuggle in odd values', () => {
    const d = parseBackup(JSON.stringify({ app: 'college-hub', version: 1, profile: { isDemo: 'yes', scale: 'x' }, courses: [{ id: '../x' }, { id: '__proto__', color: 'red;}' }], notes: {} }))!
    expect(d.courses).toEqual([{ id: '__proto__', code: '', name: '', units: 0, color: '#8e8e93' }])
    expect(d.profile).toMatchObject({ isDemo: false, scale: null })
    expect(d.notes).toEqual([])
  })
})
