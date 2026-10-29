import type { ClassSession, Course, GradeComponent, Note, Task } from '@/types'
import { addDays, dateKey } from '@/lib/time'
import { latestMeetingOnOrBefore } from '@/features/schedule/scheduleUtils'

export const COURSE_COLORS = [
  '#a58bff',
  '#4fd1c5',
  '#f2b84b',
  '#ff7a90',
  '#6cb6ff',
  '#a3e063',
  '#ff9f6b',
  '#d58bff',
] as const

export interface DemoData {
  courses: Course[]
  sessions: ClassSession[]
  tasks: Task[]
  notes: Note[]
  components: GradeComponent[]
}

/**
 * Sample data so the app is fully usable before a student adds anything.
 * Pure: due dates and note dates are built from `now`.
 */
export function makeDemoData(now: Date): DemoData {
  const courses: Course[] = [
    {
      id: 'c-fndstat',
      code: 'FNDSTAT',
      name: 'Fundamentals of statistics',
      units: 3,
      color: COURSE_COLORS[0],
      professor: 'Prof. Reyes',
      officeHours: 'Tuesdays, 2:00 to 4:00 PM',
    },
    { id: 'c-cs101', code: 'CS 101', name: 'Data Structures', units: 3, color: COURSE_COLORS[1] },
    { id: 'c-math201', code: 'MATH 201', name: 'Calculus II', units: 4, color: COURSE_COLORS[2] },
    { id: 'c-eng102', code: 'ENG 102', name: 'Composition', units: 3, color: COURSE_COLORS[3] },
    { id: 'c-phys150', code: 'PHYS 150', name: 'Mechanics', units: 4, color: COURSE_COLORS[4] },
  ]

  const sessions: ClassSession[] = [
    { id: 's-fndstat', courseId: 'c-fndstat', days: [1, 4], start: '09:15', end: '10:45', room: 'UH 310' },
    { id: 's-eng102', courseId: 'c-eng102', days: [2, 5], start: '09:15', end: '10:45', room: 'GK 204' },
    { id: 's-cs101', courseId: 'c-cs101', days: [2, 5], start: '11:00', end: '12:30', room: 'AG 1105' },
    { id: 's-math201', courseId: 'c-math201', days: [1, 4], start: '13:15', end: '14:45', room: 'V 205' },
    { id: 's-phys150', courseId: 'c-phys150', days: [3], start: '13:15', end: '16:15', room: 'Physics Lab 2' },
  ]

  const due = (days: number, time = '23:59') => `${dateKey(addDays(now, days))}T${time}`
  const task = (
    id: string,
    kind: Task['kind'],
    title: string,
    courseId: string,
    dueAt: string,
    extra: Partial<Task> = {},
  ): Task => ({ id, kind, title, courseId, due: dueAt, done: false, source: 'manual', ...extra })

  const tasks: Task[] = [
    task('t-bst', 'assignment', 'Fix edge case bug in Binary Search Tree assignment', 'c-cs101', due(0), { weight: 10 }),
    task('t-ps3', 'assignment', 'Submit Problem Set 3 on probability distributions', 'c-fndstat', due(1, '17:00'), { weight: 5 }),
    task('t-peer', 'todo', 'Peer review 2 essay drafts on Canvas', 'c-eng102', due(2)),
    task('t-ch5', 'todo', 'Read Chapter 5 on work and energy', 'c-phys150', due(4)),
    task('t-ibp', 'todo', 'Practice set on integration by parts', 'c-math201', due(6)),
    task('t-quiz', 'assignment', 'Quiz 4 on recursion and trees', 'c-cs101', due(9, '10:00'), { weight: 5 }),
    task('t-reflect', 'assignment', 'Submit essay 1 reflection', 'c-eng102', due(-2), { done: true }),
  ]

  // The demo note belongs to the previous meeting, so today's class starts with a fresh note.
  const yesterday = addDays(now, -1)
  const meeting = latestMeetingOnOrBefore(sessions[0]!, yesterday) ?? yesterday
  const stamp = now.toISOString()
  const notes: Note[] = [
    {
      id: 'n-prob',
      title: 'Probability distributions',
      courseId: 'c-fndstat',
      sessionId: 's-fndstat',
      sessionDate: dateKey(meeting),
      createdAt: stamp,
      updatedAt: stamp,
      body: [
        '# Probability distributions',
        '',
        'A **random variable** maps outcomes to numbers. Two kinds to know:',
        '',
        '- Discrete: counts things, like heads in 10 flips',
        '- Continuous: measures things, like height',
        '',
        '## To review before Problem Set 3',
        '',
        '- [x] Binomial: mean is `np`, variance is `npq`',
        '- [ ] Normal: z-scores and the 68-95-99.7 rule',
        '- [ ] Ask about the Poisson approximation',
      ].join('\n'),
    },
    {
      id: 'n-ibp',
      title: 'Integration by parts',
      courseId: 'c-math201',
      createdAt: stamp,
      updatedAt: stamp,
      body: [
        '## The formula',
        '',
        'Pick `u` and `dv`, then use `uv - ∫ v du`.',
        '',
        '1. Choose `u` with the LIATE order',
        '2. Differentiate `u`, integrate `dv`',
        '3. Check that the new integral is easier',
        '',
        '> If it gets harder, swap your choice of u.',
      ].join('\n'),
    },
  ]

  const comp = (
    id: string,
    courseId: string,
    name: string,
    weight: number,
    score: number | null,
  ): GradeComponent => ({ id, courseId, name, weight, score })

  const components: GradeComponent[] = [
    comp('g-fnd-1', 'c-fndstat', 'Problem sets', 20, 88),
    comp('g-fnd-2', 'c-fndstat', 'Long exam 1', 30, 76),
    comp('g-fnd-3', 'c-fndstat', 'Long exam 2', 30, null),
    comp('g-fnd-4', 'c-fndstat', 'Final project', 20, null),
    comp('g-cs-1', 'c-cs101', 'Quizzes', 20, 92),
    comp('g-cs-2', 'c-cs101', 'Programming assignments', 30, 85),
    comp('g-cs-3', 'c-cs101', 'Midterm exam', 25, 78),
    comp('g-cs-4', 'c-cs101', 'Final exam', 25, null),
    comp('g-math-1', 'c-math201', 'Problem sets', 25, 90),
    comp('g-math-2', 'c-math201', 'Long exam 1', 25, 82),
    comp('g-math-3', 'c-math201', 'Long exam 2', 25, null),
    comp('g-math-4', 'c-math201', 'Final exam', 25, null),
    comp('g-eng-1', 'c-eng102', 'Essay 1', 25, 88),
    comp('g-eng-2', 'c-eng102', 'Essay 2', 25, null),
    comp('g-eng-3', 'c-eng102', 'Participation', 20, 95),
    comp('g-eng-4', 'c-eng102', 'Final portfolio', 30, null),
    comp('g-phys-1', 'c-phys150', 'Lab reports', 30, 84),
    comp('g-phys-2', 'c-phys150', 'Long exam 1', 30, 70),
    comp('g-phys-3', 'c-phys150', 'Final exam', 40, null),
  ]

  return { courses, sessions, tasks, notes, components }
}

let cached: DemoData | null = null
/** One shared copy for the stores' first load, so they all agree on dates. */
export function initialDemo(): DemoData {
  cached ??= makeDemoData(new Date())
  return cached
}
