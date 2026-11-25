import { describe, expect, it } from 'vitest'
import { apply, cleanDoc, diff, type Changes, type Doc } from '@/sync/doc'

const empty: Doc = {
  profile: { name: 'Juan', isDemo: false, bannerDismissed: false, taskMode: null, scale: null, prior: { cgpa: null, units: null } },
  courses: [], sessions: [], tasks: [], notes: [], components: [],
}
const doc = (d: Partial<Doc>): Doc => cleanDoc({ ...empty, ...d })
const changes = (upsert: Partial<Changes['upsert']>): Changes => ({
  upsert: { courses: [], sessions: [], tasks: [], notes: [], components: [], ...upsert },
  remove: { courses: [], sessions: [], tasks: [], notes: [], components: [] },
})
const course = { id: 'c1', code: 'CS 1', name: '', units: 3, color: '#4fd1c5' }
const session = (extra = {}) => ({ id: 's1', courseId: 'c1', days: [1] as 1[], start: '09:00', end: '10:00', ...extra })
const task = (extra = {}) => ({ id: 't1', kind: 'assignment' as const, title: 'Midterm', done: false, source: 'manual' as const, ...extra })
const component = (extra = {}) => ({ id: 'q1', courseId: 'c1', name: 'Quiz', weight: 30, score: 42, ...extra })

describe('replaying a change saved by an older app', () => {
  // An app before 1.9.0 (1.7.0 for totals) stored these without the newer fields. If the server
  // refuses the replay, the change is laid over the account and saved again later: the fields it
  // never knew about must keep what the account holds, not turn into an explicit clear.
  const saved = doc({
    courses: [course],
    sessions: [session({ startsOn: '2026-09-07', endsOn: '2026-12-12' })],
    tasks: [task({ category: 'exam' })],
    components: [component({ totalScore: 50 })],
  })
  const legacy = changes({
    sessions: [session({ room: 'GK 204' })],
    tasks: [task({ done: true })],
    components: [component({ name: 'Quiz 1' })],
  })

  it('keeps term dates, the exam category and the total', () => {
    const after = apply(saved, legacy)
    expect(after.sessions[0]).toMatchObject({ room: 'GK 204', startsOn: '2026-09-07', endsOn: '2026-12-12' })
    expect(after.tasks[0]).toMatchObject({ done: true, category: 'exam' })
    expect(after.components[0]).toMatchObject({ name: 'Quiz 1', totalScore: 50 })
  })

  it('so the later save sends no clear for them', () => {
    const retry = diff(saved, apply(saved, legacy))
    expect(retry.upsert.sessions[0]).toMatchObject({ startsOn: '2026-09-07', endsOn: '2026-12-12' })
    expect(retry.upsert.tasks[0]).toMatchObject({ category: 'exam' })
    expect(retry.upsert.components[0]).toMatchObject({ totalScore: 50 })
  })

  it('still clears a field sent as null', () => {
    const after = apply(saved, changes({ sessions: [session({ startsOn: null, endsOn: null })], tasks: [task({ category: null })] }))
    expect(after.sessions[0]!.startsOn ?? null).toBeNull()
    expect(after.tasks[0]!.category ?? null).toBeNull()
  })

  it('never keeps an exam on a task turned into a to-do', () => {
    const after = apply(saved, changes({ tasks: [task({ kind: 'todo' })] }))
    expect(after.tasks[0]).toMatchObject({ kind: 'todo', category: null })
  })
})
