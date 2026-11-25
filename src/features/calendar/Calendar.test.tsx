import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { ClassSession, Task } from '@/types'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useTaskStore } from '@/store/useTaskStore'
import { rescheduleTask } from '@/store/actions'
import { resetStores } from '@/test/seed'
import { CALENDAR_KEY } from './useCalendarPrefs'

// Tuesday, November 24 2026, 8:00. The week shown is Nov 23 to 27.
const NOW = new Date(2026, 10, 24, 8, 0)

const task = (id: string, title: string, due?: string, extra: Partial<Task> = {}): Task => ({ id, kind: 'assignment', title, due, done: false, source: 'manual', ...extra })
const cls = (id: string, extra: Partial<ClassSession> = {}): ClassSession => ({ id, courseId: 'c-fndstat', days: [1, 4], start: '09:15', end: '10:45', room: 'UH 310', ...extra })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStores(NOW)
  localStorage.removeItem(CALENDAR_KEY)
  useScheduleStore.setState({ sessions: [cls('fnd')] })
  useTaskStore.setState({
    tasks: [
      task('essay', 'Essay draft', '2026-11-24T23:59'),
      task('quiz', 'Quiz 4', '2026-11-26T10:00'),
      task('undated', 'Someday reading'),
    ],
  })
  window.location.hash = '#schedule'
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.removeItem(CALENDAR_KEY)
  window.location.hash = ''
})

const toolbarTitle = () => screen.getByRole('heading', { level: 2, name: /2026|2027/ }).textContent
const pop = (name: string | RegExp) => screen.getByRole('dialog', { name })
const tasks = () => useTaskStore.getState().tasks
const display = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Display' }))
  return pop('Display')
}
const panel = (name: string) => screen.getByRole('complementary', { name })

describe('the calendar', () => {
  it('shows the week: deadlines in their own row, timed tasks at their time, classes in their slots', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'Schedule' })).toBeInTheDocument()
    expect(toolbarTitle()).toBe('Nov 23 – 29, 2026')
    expect(screen.getByRole('button', { name: /^Essay draft, due [A-Z]/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quiz 4, due Thursday, November 26 at 10:00 AM' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^FNDSTAT, (Monday|Thursday)/ })).toHaveLength(2)
    // Tasks without a date stay on the To-Do List only.
    expect(screen.queryByRole('button', { name: /Someday reading/ })).not.toBeInTheDocument()
  })

  it('moves through past and future weeks and months, and back to today', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(toolbarTitle()).toBe('Nov 16 – 22, 2026')
    expect(screen.getByRole('button', { name: 'Today' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(toolbarTitle()).toBe('Nov 23 – 29, 2026')
    expect(screen.getByRole('button', { name: 'Today' })).toBeDisabled()
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    expect(toolbarTitle()).toBe('November 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(toolbarTitle()).toBe('January 2027')
  })

  it('remembers the view and the display settings', () => {
    const first = render(<App />)
    // No class meets on a weekend, so they start hidden.
    expect(within(display()).getByRole('switch', { name: 'Weekends' })).not.toBeChecked()
    expect(screen.queryByText('Sat')).not.toBeInTheDocument()
    fireEvent.click(within(pop('Display')).getByRole('switch', { name: 'Weekends' }))
    fireEvent.click(within(pop('Display')).getByRole('checkbox', { name: 'To-dos' }))
    fireEvent.keyDown(pop('Display'), { key: 'Escape' })
    expect(screen.getByText('Sat')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    first.unmount()
    render(<App />)
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
    expect(within(display()).getByRole('switch', { name: 'Weekends' })).toBeChecked()
    expect(within(pop('Display')).getByRole('checkbox', { name: 'To-dos' })).not.toBeChecked()
  })

  it('never hides a weekend deadline without saying so', () => {
    useTaskStore.setState({ tasks: [task('sat', 'Saturday essay', '2026-11-28T23:59'), task('sun', 'Sunday quiz', '2026-11-29T09:00')] })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '2 on weekends' }))
    expect(screen.getByRole('button', { name: /^Saturday essay, due [A-Z]/ })).toBeInTheDocument()
    expect(within(display()).getByRole('switch', { name: 'Weekends' })).toBeChecked()
    expect(screen.queryByRole('button', { name: /on weekends/ })).not.toBeInTheDocument()
  })

  it('shows weekends by default when a class meets on one', () => {
    useScheduleStore.setState({ sessions: [cls('sat', { days: [6] })] })
    render(<App />)
    expect(screen.getByText('Sat')).toBeInTheDocument()
  })

  it('shows or hides each kind of item, and completed tasks', () => {
    useTaskStore.setState({
      tasks: [task('a', 'Essay', '2026-11-24'), task('e', 'Midterm', '2026-11-25T10:00', { category: 'exam' }), task('t', 'Groceries', '2026-11-26', { kind: 'todo' }), task('d', 'Old quiz', '2026-11-23', { kind: 'todo', done: true })],
    })
    render(<App />)
    const toggle = (name: string, role: 'checkbox' | 'switch' = 'checkbox') => fireEvent.click(within(pop('Display')).getByRole(role, { name }))
    display()
    toggle('Exams')
    expect(screen.queryByRole('button', { name: /^Midterm/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Essay, due [A-Z]/ })).toBeInTheDocument()
    toggle('Assignments')
    expect(screen.queryByRole('button', { name: /^Essay, due [A-Z]/ })).not.toBeInTheDocument()
    toggle('Classes')
    expect(screen.queryByRole('button', { name: /^FNDSTAT, / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Old quiz, due [A-Z][^,]*, [A-Z][a-z]+ [0-9]+, done$/ })).toBeInTheDocument()
    toggle('Completed tasks', 'switch')
    expect(screen.queryByRole('button', { name: /^Old quiz/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Groceries, due [A-Z]/ })).toBeInTheDocument()
    // Hiding never changes the tasks themselves.
    expect(tasks()).toHaveLength(4)
  })

  it('shows an exam as an exam', () => {
    useTaskStore.setState({ tasks: [task('mid', 'Midterm', '2026-11-25T10:00', { category: 'exam' }), task('fin', 'Final', '2026-11-27', { category: 'exam' })] })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Midterm, exam Wednesday, November 25 at 10:00 AM' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Final, exam [A-Z]/ })).toBeInTheDocument()
  })
})

describe('short events', () => {
  it('keeps back-to-back 15-minute classes inside their own slots, on one compact line', () => {
    useScheduleStore.setState({
      sessions: [cls('a', { days: [3], start: '09:00', end: '09:15' }), cls('b', { courseId: 'c-cs101', days: [3], start: '09:15', end: '09:30' })],
    })
    render(<App />)
    const [first, second] = ['FNDSTAT', 'CS 101'].map((code) => screen.getByRole('button', { name: new RegExp(`^${code}, Wednesday`) }))
    const px = (el: HTMLElement, prop: 'top' | 'height') => parseFloat(el.style[prop])
    // Same lane, and the first ends before the second begins.
    expect(first!.style.left).toBe(second!.style.left)
    expect(px(first!, 'top') + px(first!, 'height')).toBeLessThanOrEqual(px(second!, 'top'))
    expect(px(second!, 'top') - px(first!, 'top')).toBe(15)
    expect(first).toHaveAttribute('data-compact')
  })

  it('keeps a popover inside the window, scrolling inside, with the keyboard kept in it', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: /^FNDSTAT, / })[0]!)
    const details = pop('Class')
    expect(details.className.split(' ')).toEqual(expect.arrayContaining(['max-h-[calc(100dvh-1.5rem)]', 'overflow-y-auto']))
    // Nothing to type in, so the panel itself takes focus, and Tab stays inside.
    expect(details).toHaveFocus()
    fireEvent.keyDown(details, { key: 'Tab', shiftKey: true })
    expect(within(details).getByRole('button', { name: 'Notes and details' })).toHaveFocus()
    fireEvent.keyDown(within(details).getByRole('button', { name: 'Notes and details' }), { key: 'Tab' })
    expect(within(details).getByRole('button', { name: 'Edit class' })).toHaveFocus()
  })
})

describe('the calendar and the To-Do List are one list', () => {
  it('adds a deadline from the calendar as a task', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a task due Wednesday, November 25' }))
    fireEvent.change(within(pop('New task')).getByRole('textbox', { name: 'Task name' }), { target: { value: 'Read chapter 7' } })
    fireEvent.click(within(pop('New task')).getByRole('button', { name: 'Add task' }))
    expect(tasks().find((t) => t.title === 'Read chapter 7')).toMatchObject({ kind: 'todo', due: '2026-11-25T23:59', done: false, source: 'manual' })
    expect(screen.getByRole('button', { name: /^Read chapter 7, due [A-Z]/ })).toBeInTheDocument()
  })

  it('adds a task at the time picked on the grid, or a class there instead', () => {
    render(<App />)
    const wednesday = document.querySelector('[data-day="2026-11-25"]')!
    // 2 hours below the top of an 8 AM grid (60 px an hour): 10:00.
    fireEvent.click(wednesday, { clientY: 120 })
    expect(within(pop('New task')).getByText(/Due Wed, Nov 25 at 10:00 AM/)).toBeInTheDocument()
    fireEvent.click(within(pop('New task')).getByRole('button', { name: 'Add a class instead' }))
    expect(screen.getByRole('dialog', { name: 'Add class' })).toBeInTheDocument()
  })

  it('keeps the keyboard on a task after its new date moves it to another day', async () => {
    render(<App />)
    const opener = screen.getByRole('button', { name: /^Essay draft, due Tuesday, November 24/ })
    opener.focus()
    fireEvent.click(opener)
    const details = pop('Task')
    fireEvent.change(within(details).getByLabelText('Due'), { target: { value: '2026-11-26' } })
    // The button that opened it is gone; the task now sits on Thursday.
    expect(opener.isConnected).toBe(false)
    fireEvent.keyDown(details, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Essay draft, due Thursday, November 26/ })))
  })

  it('names the day of every task in the deadline row, and what "more" opens', () => {
    useTaskStore.setState({ tasks: ['A', 'B', 'C', 'D', 'E'].map((t, i) => task(`m${i}`, `Task ${t}`, '2026-11-26')) })
    render(<App />)
    expect(screen.getByRole('button', { name: 'Task A, due Thursday, November 26' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^\d+ more due Thursday, November 26$/ })).toBeInTheDocument()
  })

  it('completes, renames, reschedules and deletes the same task the To-Do List shows', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Essay draft, due [A-Z]/ }))
    const details = pop('Task')
    fireEvent.click(within(details).getByRole('checkbox', { name: 'Mark done: Essay draft' }))
    expect(tasks().find((t) => t.id === 'essay')?.done).toBe(true)

    const name = within(details).getByRole('textbox', { name: 'Task name' })
    fireEvent.change(name, { target: { value: 'Essay final draft' } })
    fireEvent.blur(name)
    expect(tasks().find((t) => t.id === 'essay')?.title).toBe('Essay final draft')

    // A time moves it out of the deadline row and onto the grid.
    fireEvent.change(within(details).getByLabelText('Time'), { target: { value: '15:00' } })
    expect(tasks().find((t) => t.id === 'essay')?.due).toBe('2026-11-24T15:00')
    expect(screen.getByRole('button', { name: 'Essay final draft, due Tuesday, November 24 at 3:00 PM, done' })).toBeInTheDocument()

    fireEvent.click(within(details).getByRole('button', { name: 'Delete' }))
    expect(tasks().some((t) => t.id === 'essay')).toBe(false)
    // The same Undo as on the To-Do List.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(tasks().some((t) => t.id === 'essay')).toBe(true)
  })

  it('drops the grade weight when an assignment becomes a to-do, as the task dialog does', () => {
    useTaskStore.setState({ tasks: [task('essay', 'Essay draft', '2026-11-24T23:59', { weight: 20 })] })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: /^Essay draft, due [A-Z]/ }))
    fireEvent.change(within(pop('Task')).getByLabelText('Type'), { target: { value: 'todo' } })
    const essay = tasks().find((t) => t.id === 'essay')!
    expect(essay).toMatchObject({ kind: 'todo', category: null })
    expect(essay.weight).toBeUndefined()
  })

  it('shows tasks added or changed on the To-Do List straight away', () => {
    render(<App />)
    act(() => useTaskStore.getState().addTask({ kind: 'assignment', title: 'Lab report', due: '2026-11-27T23:59' }))
    expect(screen.getByRole('button', { name: /^Lab report, due [A-Z]/ })).toBeInTheDocument()
    act(() => useTaskStore.getState().toggleTask('quiz'))
    expect(screen.getByRole('button', { name: /^Quiz 4, due .*, done$/ })).toBeInTheDocument()
    act(() => useTaskStore.getState().removeTask('quiz'))
    expect(screen.queryByRole('button', { name: /^Quiz 4/ })).not.toBeInTheDocument()
  })

  it('makes no copies: everything on the calendar is a task or a class that already exists', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    expect(tasks()).toHaveLength(3)
    expect(useScheduleStore.getState().sessions).toHaveLength(1)
  })
})

describe('rescheduling', () => {
  it('undoes only the move, keeping what was done in between', () => {
    render(<App />)
    // The calendar's drag ends here: Essay draft moves from Tuesday to Thursday.
    act(() => rescheduleTask('essay', '2026-11-26T23:59', 'Moved to Thu, Nov 26.'))
    expect(tasks().find((t) => t.id === 'essay')?.due).toBe('2026-11-26T23:59')
    // Meanwhile another task is finished in the day panel.
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, November 26, details' }))
    fireEvent.click(within(panel('Thursday, November 26')).getByRole('checkbox', { name: 'Mark done: Quiz 4' }))
    // Undo on the move's message.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(tasks().find((t) => t.id === 'essay')?.due).toBe('2026-11-24T23:59')
    expect(tasks().find((t) => t.id === 'quiz')?.done).toBe(true)
  })

  it('keeps a new name however the panel is closed', () => {
    render(<App />)
    for (const [close, name] of [['escape', 'Essay, second draft'], ['outside', 'Essay, final draft']] as const) {
      fireEvent.click(screen.getByRole('button', { name: /^Essay/ }))
      const details = pop('Task')
      fireEvent.change(within(details).getByRole('textbox', { name: 'Task name' }), { target: { value: name } })
      if (close === 'escape') fireEvent.keyDown(details, { key: 'Escape' })
      else fireEvent.pointerDown(document.body)
      expect(screen.queryByRole('dialog', { name: 'Task' })).not.toBeInTheDocument()
      expect(tasks().find((t) => t.id === 'essay')?.title).toBe(name)
    }
    // An emptied name is never saved; the last one stays.
    fireEvent.click(screen.getByRole('button', { name: /^Essay/ }))
    fireEvent.change(within(pop('Task')).getByRole('textbox', { name: 'Task name' }), { target: { value: '   ' } })
    fireEvent.keyDown(pop('Task'), { key: 'Escape' })
    expect(tasks().find((t) => t.id === 'essay')?.title).toBe('Essay, final draft')
  })

  it('leaves a task alone on Undo if it was moved again or deleted', () => {
    render(<App />)
    act(() => rescheduleTask('essay', '2026-11-26T23:59', 'Moved.'))
    act(() => useTaskStore.getState().updateTask('essay', { due: '2026-11-27T23:59' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(tasks().find((t) => t.id === 'essay')?.due).toBe('2026-11-27T23:59')
  })
})

describe('midnight', () => {
  it('draws a task due at 12:00 AM as a readable block at the top of the day, and opens it', () => {
    useTaskStore.setState({ tasks: [task('late', 'Submit portal form', '2026-11-25T00:00')] })
    render(<App />)
    const block = screen.getByRole('button', { name: 'Submit portal form, due Wednesday, November 25 at 12:00 AM' })
    expect(parseFloat(block.style.height)).toBeGreaterThanOrEqual(27)
    expect(parseFloat(block.style.top)).toBe(1)
    expect(block).toHaveTextContent('Submit portal form12:00 AM')
    fireEvent.click(block)
    expect(within(pop('Task')).getByRole('textbox', { name: 'Task name' })).toHaveValue('Submit portal form')
  })
})

describe('the day panel', () => {
  it('opens beside the calendar with classes, deadlines, free time and clashes', () => {
    useScheduleStore.setState({
      sessions: [cls('fnd'), cls('cs', { courseId: 'c-cs101', days: [4], start: '10:00', end: '11:30' }), cls('math', { courseId: 'c-math201', days: [4], start: '13:15', end: '14:45' })],
    })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, November 26, details' }))
    const day = panel('Thursday, November 26')
    expect(within(day).getByRole('heading', { name: 'Thursday, November 26' })).toHaveFocus()
    expect(within(day).getByRole('region', { name: 'Classes' })).toHaveTextContent(/FNDSTAT.*CS 101.*MATH 201/)
    expect(within(day).getByRole('region', { name: 'Clashes' })).toHaveTextContent('FNDSTAT and CS 101 overlap, 10:00 AM to 10:45 AM')
    expect(within(day).getByRole('region', { name: 'Free between classes' })).toHaveTextContent('11:30 AM to 1:15 PM1 h 45 min')
    expect(within(day).getByRole('region', { name: 'Due' })).toHaveTextContent('Quiz 4')
    // Ticking a task off here is ticking it off on the To-Do List.
    fireEvent.click(within(day).getByRole('checkbox', { name: 'Mark done: Quiz 4' }))
    expect(tasks().find((t) => t.id === 'quiz')?.done).toBe(true)
    fireEvent.keyDown(day, { key: 'Escape' })
    expect(screen.queryByRole('complementary', { name: /November/ })).not.toBeInTheDocument()
  })

  it('closes with its button, and adds a task for its day', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Wednesday, November 25, details' }))
    fireEvent.click(within(panel('Wednesday, November 25')).getByRole('button', { name: 'Add task' }))
    fireEvent.change(within(pop('New task')).getByRole('textbox', { name: 'Task name' }), { target: { value: 'Midterm' } })
    fireEvent.click(within(pop('New task')).getByRole('radio', { name: 'Exam' }))
    fireEvent.click(within(pop('New task')).getByRole('button', { name: 'Add task' }))
    expect(tasks().find((t) => t.title === 'Midterm')).toMatchObject({ kind: 'assignment', category: 'exam', due: '2026-11-25T23:59' })
    fireEvent.click(within(panel('Wednesday, November 25')).getByRole('button', { name: 'Close day details' }))
    expect(screen.queryByRole('complementary', { name: /November/ })).not.toBeInTheDocument()
  })
})

describe('a crowded month', () => {
  it('shows a few items a day and the rest behind "more"', () => {
    useTaskStore.setState({
      tasks: ['A', 'B', 'C', 'D'].map((t, i) => task(`t${i}`, `Task ${t}`, '2026-11-26T23:59')),
    })
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    const thursday = screen.getByRole('group', { name: 'Thursday, November 26, 5 items' })
    // Two shown, then "3 more" (four tasks and a class).
    expect(within(thursday).getAllByRole('button', { name: /^Task [A-D], due$/ })).toHaveLength(2)
    fireEvent.click(within(thursday).getByRole('button', { name: '3 more' }))
    const day = panel('Thursday, November 26')
    expect(within(within(day).getByRole('region', { name: 'Due' })).getAllByRole('button', { name: /^Task [A-D]$/ })).toHaveLength(4)
    expect(within(day).getByRole('region', { name: 'Classes' })).toHaveTextContent('FNDSTAT')
    // From the list, straight to a task.
    fireEvent.click(within(day).getByRole('button', { name: 'Task D' }))
    expect(within(pop('Task')).getByRole('textbox', { name: 'Task name' })).toHaveValue('Task D')
  })

  it('opens a day from its number, and its week from there', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Monday, November 9, details' }))
    fireEvent.click(within(panel('Monday, November 9')).getByRole('button', { name: 'Show week' }))
    expect(toolbarTitle()).toBe('Nov 9 – 15, 2026')
    expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked()
  })
})

describe('terms', () => {
  it('keeps an ended class in the weeks it met, and not after', () => {
    useScheduleStore.setState({ sessions: [cls('fall', { endsOn: '2026-11-20' }), cls('spring', { courseId: 'c-cs101', days: [2], startsOn: '2026-11-23' })] })
    render(<App />)
    expect(screen.queryByRole('button', { name: /^FNDSTAT, / })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^CS 101, Tuesday/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(screen.getAllByRole('button', { name: /^FNDSTAT, / })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /^CS 101, / })).not.toBeInTheDocument()
  })

  it('ends the term for every running class, keeps its history, and can be undone', () => {
    useScheduleStore.setState({ sessions: [cls('fnd'), cls('next', { courseId: 'c-cs101', startsOn: '2027-01-11' })] })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Term' }))
    const end = pop('Term')
    fireEvent.change(within(end).getByLabelText('Last day of the term'), { target: { value: '2026-11-24' } })
    expect(within(end).getByRole('status')).toHaveTextContent('1 class ends on Tue, Nov 24.')
    fireEvent.click(within(end).getByRole('button', { name: 'End term' }))
    const sessions = useScheduleStore.getState().sessions
    expect(sessions.find((s) => s.id === 'fnd')?.endsOn).toBe('2026-11-24')
    // Next term's class is untouched.
    expect(sessions.find((s) => s.id === 'next')?.endsOn).toBeUndefined()
    // Monday's meeting stays; Thursday's is after the term.
    expect(screen.getAllByRole('button', { name: /^FNDSTAT, / }).map((b) => b.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^FNDSTAT, Monday/)])
    // Something else changes before Undo: it stays.
    act(() => useScheduleStore.getState().updateSession('next', { room: 'GK 101' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useScheduleStore.getState().sessions.find((s) => s.id === 'fnd')?.endsOn ?? null).toBeNull()
    expect(useScheduleStore.getState().sessions.find((s) => s.id === 'next')?.room).toBe('GK 101')
  })

  it('starts a class added after a term ended on the following day', () => {
    useScheduleStore.setState({ sessions: [cls('fall', { endsOn: '2026-11-20' })] })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
    const dialog = screen.getByRole('dialog', { name: 'Add class' })
    expect(within(dialog).getByLabelText('First day (optional)')).toHaveValue('2026-11-21')
    expect(within(dialog).getByLabelText('Last day (optional)')).toHaveValue('')
  })

  it('starts every class added for the new term on its first day, not only the first one', () => {
    useScheduleStore.setState({ sessions: [cls('fall', { endsOn: '2026-11-20' })] })
    render(<App />)
    for (const [start, end] of [['08:00', '09:00'], ['13:00', '14:00']]) {
      fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
      const dialog = screen.getByRole('dialog', { name: 'Add class' })
      expect(within(dialog).getByLabelText('First day (optional)')).toHaveValue('2026-11-21')
      fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: start } })
      fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: end } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add class' }))
    }
    const added = useScheduleStore.getState().sessions.filter((s) => s.id !== 'fall')
    expect(added).toHaveLength(2)
    // Neither new class reaches back into the term that ended.
    for (const s of added) expect(s.startsOn).toBe('2026-11-21')
  })

  it('does not push a class into next term while this term is still running', () => {
    // The current term has a last day in December; today is November 24.
    useScheduleStore.setState({ sessions: [cls('fall', { endsOn: '2026-12-12' }), cls('old', { courseId: 'c-cs101', endsOn: '2026-08-01' })] })
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
    const dialog = screen.getByRole('dialog', { name: 'Add class' })
    // A class is still running, so the new one belongs to this term: no start date.
    expect(within(dialog).getByLabelText('First day (optional)')).toHaveValue('')
  })
})
