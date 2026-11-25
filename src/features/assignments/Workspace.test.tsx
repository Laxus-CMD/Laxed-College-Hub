import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { Task } from '@/types'
import { resetStores } from '@/test/seed'
import { cleanDoc, readStores } from '@/sync/doc'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
import { useSyncStore, CLOSED } from '@/sync/useSyncStore'
import { useTaskMode } from './workspace/useTaskMode'
import { TaskDialog } from './TaskDialog'
import WorkloadMode from './workload/WorkloadMode'
import { CLASSIC_KEY } from './classic/collapse'

// Tuesday, November 24 2026, 8:00.
const NOW = new Date(2026, 10, 24, 8, 0)
const task = (id: string, title: string, due?: string, extra: Partial<Task> = {}): Task => ({ id, kind: 'assignment', title, due, done: false, source: 'manual', ...extra })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStores(NOW)
  localStorage.removeItem(CLASSIC_KEY)
  useTaskStore.setState({
    tasks: [
      task('late', 'Lab report', '2026-11-20'),
      task('essay', 'Essay draft', '2026-11-24T23:59', { courseId: 'c-eng102' }),
      task('quiz', 'Quiz 4', '2026-11-26T10:00', { courseId: 'c-fndstat' }),
      task('old', 'Problem Set 3', '2026-11-18', { done: true }),
    ],
  })
  window.location.hash = '#assignments'
})
afterEach(() => {
  useSyncStore.setState(CLOSED)
  vi.useRealTimers()
  localStorage.removeItem(CLASSIC_KEY)
  window.location.hash = ''
})

const group = (name: string) => screen.getByRole('region', { name })
const fold = (name: string) => within(group(name)).getByRole('button', { name: new RegExp(`^${name}`) })

describe('the workspace mode', () => {
  it('is kept with the student data, so it follows the account', () => {
    act(() => useSettingsStore.getState().setTaskMode('classic'))
    expect(readStores().profile.taskMode).toBe('classic')
  })

  it('reads an unknown or missing mode as never chosen', () => {
    const doc = readStores()
    expect(cleanDoc({ ...doc, profile: { ...doc.profile, taskMode: 'kanban' as never } }).profile.taskMode).toBeNull()
  })

  it('opens Classic for a mode this version does not have yet', () => {
    useSettingsStore.setState({ taskMode: 'between' })
    render(<App />)
    expect(screen.getByRole('form', { name: 'Add a task' })).toBeInTheDocument()
    expect(group('Overdue')).toHaveTextContent('Lab report')
  })
})

describe('Classic', () => {
  it('groups open work by when it is due, with finished work folded away', () => {
    render(<App />)
    expect(screen.getByRole('img', { name: '25 percent of tasks done' })).toBeInTheDocument()
    expect(group('Overdue')).toHaveTextContent('Lab report')
    expect(group('Due today')).toHaveTextContent('Essay draft')
    expect(group('This week')).toHaveTextContent('Quiz 4')
    expect(fold('Completed')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Problem Set 3')).not.toBeInTheDocument()
    fireEvent.click(fold('Completed'))
    expect(group('Completed')).toHaveTextContent('Problem Set 3')
  })

  it('folds a group and remembers it in this browser', () => {
    const { unmount } = render(<App />)
    fireEvent.click(fold('Overdue'))
    expect(fold('Overdue')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Lab report')).not.toBeInTheDocument()
    unmount()
    render(<App />)
    expect(fold('Overdue')).toHaveAttribute('aria-expanded', 'false')
  })

  it('unfolds the group of a task opened from elsewhere', () => {
    useUiStore.getState().flashTask('old')
    render(<App />)
    expect(group('Completed')).toHaveTextContent('Problem Set 3')
  })

  it('adds a task in place, to the course being shown', () => {
    useUiStore.getState().setTaskCourse('c-fndstat')
    render(<App />)
    expect(screen.queryByText('Essay draft')).not.toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Add a task' })
    fireEvent.change(within(form).getByLabelText('Task title'), { target: { value: 'Read chapter 6' } })
    fireEvent.change(within(form).getByLabelText('Due date'), { target: { value: '2026-11-25' } })
    fireEvent.submit(form)
    expect(useTaskStore.getState().tasks.find((t) => t.title === 'Read chapter 6')).toMatchObject({ kind: 'todo', courseId: 'c-fndstat', due: '2026-11-25T23:59' })
    expect(group('This week')).toHaveTextContent('Read chapter 6')
    expect(within(form).getByLabelText('Task title')).toHaveValue('')
  })

  it('adds a task with no course while a course is shown, if asked', () => {
    useUiStore.getState().setTaskCourse('c-fndstat')
    render(<App />)
    const form = screen.getByRole('form', { name: 'Add a task' })
    fireEvent.change(within(form).getByLabelText('Course'), { target: { value: '' } })
    expect(within(form).getByLabelText('Course')).toHaveValue('')
    fireEvent.change(within(form).getByLabelText('Task title'), { target: { value: 'Buy a planner' } })
    fireEvent.submit(form)
    expect(useTaskStore.getState().tasks.find((t) => t.title === 'Buy a planner')?.courseId).toBeUndefined()
  })

  it('starts the next task in the course being shown after the filter changes', () => {
    render(<App />)
    const form = screen.getByRole('form', { name: 'Add a task' })
    fireEvent.change(within(form).getByLabelText('Course'), { target: { value: 'c-eng102' } })
    act(() => useUiStore.getState().setTaskCourse('c-fndstat'))
    expect(within(form).getByLabelText('Course')).toHaveValue('c-fndstat')
  })

  it('stops filtering by a course that no longer exists', () => {
    useUiStore.getState().setTaskCourse('c-gone')
    render(<App />)
    expect(group('Overdue')).toHaveTextContent('Lab report')
    expect(group('Due today')).toHaveTextContent('Essay draft')
  })

  it('unfolds the group again when the same task is opened a second time', () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.setSystemTime(NOW)
    render(<App />)
    act(() => useUiStore.getState().flashTask('old'))
    expect(group('Completed')).toHaveTextContent('Problem Set 3')
    act(() => vi.advanceTimersByTime(2000))
    expect(useUiStore.getState().flashTaskId).toBeNull()
    fireEvent.click(fold('Completed'))
    expect(screen.queryByText('Problem Set 3')).not.toBeInTheDocument()
    act(() => useUiStore.getState().flashTask('old'))
    expect(group('Completed')).toHaveTextContent('Problem Set 3')
  })

  it('shows a change made anywhere else straight away', () => {
    render(<App />)
    act(() => useTaskStore.getState().toggleTask('late'))
    expect(screen.queryByRole('region', { name: 'Overdue' })).not.toBeInTheDocument()
  })
})

describe('choosing a mode', () => {
  it('offers Flow to a guest and remembers the choice', async () => {
    render(<App />)
    const modes = screen.getByRole('radiogroup', { name: 'Workspace mode' })
    expect(within(modes).getByRole('radio', { name: 'Classic' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(modes).getByRole('radio', { name: 'Flow' }))
    expect(useSettingsStore.getState().taskMode).toBe('flow')
    expect(await screen.findByRole('region', { name: 'In progress' })).toBeInTheDocument()
  })

  it('moves between modes with the arrow keys', () => {
    render(<App />)
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Classic' }), { key: 'ArrowRight' })
    expect(useSettingsStore.getState().taskMode).toBe('flow')
    expect(screen.getByRole('radio', { name: 'Flow' })).toHaveFocus()
  })

  it('offers no Flow, and no choice of mode, while the account API cannot keep them', () => {
    useSettingsStore.setState({ taskMode: 'flow' })
    useSyncStore.setState({ accountId: 'a1', features: [] })
    const { result, rerender } = renderHook(() => useTaskMode())
    expect(result.current).toMatchObject({ mode: 'classic', canChoose: false })
    // Workload stores nothing new itself, so it is not held back.
    expect(result.current.modes.map((m) => m.id)).toEqual(['classic', 'workload'])
    act(() => useSyncStore.setState({ features: ['taskMode', 'progress'] }))
    rerender()
    expect(result.current).toMatchObject({ mode: 'flow', canChoose: true })
  })
})

describe('Flow', () => {
  const column = (name: string) => screen.getByRole('region', { name })
  const open = async () => {
    useSettingsStore.setState({ taskMode: 'flow' })
    render(<App />)
    await screen.findByRole('region', { name: 'Not started' })
  }

  it('sorts tasks into Not started, In progress and Completed', async () => {
    useTaskStore.getState().updateTask('quiz', { progress: 'started' })
    await open()
    expect(column('Not started')).toHaveTextContent('Lab report')
    expect(column('Not started')).toHaveTextContent('Essay draft')
    expect(column('In progress')).toHaveTextContent('Quiz 4')
    expect(column('Completed')).toHaveTextContent('Problem Set 3')
  })

  it('starts, completes and reopens a task with its buttons, which Classic and the calendar see too', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Start Essay draft' }))
    expect(column('In progress')).toHaveTextContent('Essay draft')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'essay')).toMatchObject({ done: false, progress: 'started' })
    fireEvent.click(screen.getByRole('button', { name: 'Complete Essay draft' }))
    expect(column('Completed')).toHaveTextContent('Essay draft')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'essay')).toMatchObject({ done: true, progress: 'started' })
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Essay draft' }))
    expect(column('In progress')).toHaveTextContent('Essay draft')
  })

  it('keeps the keyboard on a task after moving it', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Start Essay draft' }))
    await waitFor(() => expect(within(column('In progress')).getByRole('button', { name: 'Essay draft' })).toHaveFocus())
  })

  it('keeps the keyboard on a task that is completed past the first few shown', async () => {
    useTaskStore.setState({
      tasks: [
        ...Array.from({ length: 12 }, (_, i) => task(`d${i}`, `Done ${i}`, `2026-11-${String(i + 10).padStart(2, '0')}`, { done: true })),
        task('w', 'Undated work', undefined, { progress: 'started' }),
      ],
    })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Undated work' }))
    await waitFor(() => expect(within(column('Completed')).getByRole('button', { name: 'Undated work' })).toHaveFocus())
  })

  it('lists completed work latest due first, with undated work last', async () => {
    useTaskStore.setState({
      tasks: [task('a', 'Older', '2026-11-02', { done: true }), task('b', 'Undated', undefined, { done: true }), task('c', 'Newer', '2026-11-20', { done: true })],
    })
    await open()
    expect(within(column('Completed')).getAllByRole('button', { name: /^(Older|Undated|Newer)$/ }).map((b) => b.textContent)).toEqual(['Newer', 'Older', 'Undated'])
  })

  it('undoes a move', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Start Lab report' }))
    expect(screen.getByText('Moved to In progress.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(column('Not started')).toHaveTextContent('Lab report')
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'late')?.progress ?? null).toBeNull()
  })

  it('shows the latest completed work, and the rest on request', async () => {
    useTaskStore.setState({ tasks: Array.from({ length: 14 }, (_, i) => task(`d${i}`, `Done ${i}`, `2026-11-${String(i + 1).padStart(2, '0')}`, { done: true })) })
    await open()
    expect(within(column('Completed')).getAllByRole('button', { name: /^Done [0-9]+$/ })).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: 'Show 2 more' }))
    expect(within(column('Completed')).getAllByRole('button', { name: /^Done [0-9]+$/ })).toHaveLength(14)
  })

  it('adds a task to Not started', async () => {
    await open()
    const form = screen.getByRole('form', { name: 'Add a task' })
    fireEvent.change(within(form).getByLabelText('Task title'), { target: { value: 'Outline essay' } })
    fireEvent.submit(form)
    expect(column('Not started')).toHaveTextContent('Outline essay')
  })
})

describe('Classic and Flow together', () => {
  it('shows which open tasks are in progress', () => {
    useTaskStore.getState().updateTask('quiz', { progress: 'started' })
    render(<App />)
    expect(group('This week')).toHaveTextContent('In progress')
  })
})

describe('Workload', () => {
  const open = async () => {
    useSettingsStore.setState({ taskMode: 'workload' })
    render(<App />)
    await screen.findByRole('region', { name: 'Due each day' })
  }

  it('counts what is due each day, and says what it leaves out', async () => {
    await open()
    expect(screen.getByText(/due in the next 14 days/).closest('p')).toHaveTextContent('2 open tasks due in the next 14 days. 1 task overdue.')
    expect(screen.getByRole('button', { name: /^Tuesday, November 24: 1 task/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Thursday, November 26: 1 task \(FNDSTAT\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Friday, November 27: nothing due/ })).toBeInTheDocument()
  })

  it('shows the tasks of the day picked on the chart', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: /^Thursday, November 26/ }))
    expect(screen.getByRole('region', { name: 'Thursday, November 26' })).toHaveTextContent('Quiz 4')
  })

  it('offers time only once a student gives an estimate, and never makes one up', async () => {
    await open()
    expect(screen.queryByRole('tab', { name: 'Time needed' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Thursday, November 26/ }))
    fireEvent.change(screen.getByLabelText('Time needed for Quiz 4'), { target: { value: '90' } })
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'quiz')?.estimate).toBe(90)
    fireEvent.click(screen.getByRole('tab', { name: 'Time needed' }))
    // Only the estimated task adds time; the other is counted, not guessed.
    expect(screen.getByRole('heading', { name: /Estimated time due each day/ })).toHaveTextContent('only tasks with an estimate')
    expect(screen.getByText(/due in the next 14 days/).closest('p')).toHaveTextContent('1 h 30 min estimated for 1 of them')
  })

  it('shows the same numbers as a table', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }))
    const row = screen.getByRole('rowheader', { name: 'Thursday, November 26' }).closest('tr')!
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '0', '—'])
  })

  it('hides estimates while the account API cannot keep them', () => {
    useSyncStore.setState({ accountId: 'a1', features: ['taskMode'] })
    const { result } = renderHook(() => useTaskMode())
    expect(result.current.modes.map((m) => m.id)).toEqual(['classic', 'workload'])
    render(<WorkloadMode />)
    fireEvent.click(screen.getByRole('button', { name: /^Thursday, November 26/ }))
    expect(screen.getByRole('region', { name: 'Thursday, November 26' })).toHaveTextContent('Quiz 4')
    expect(screen.queryByLabelText('Time needed for Quiz 4')).not.toBeInTheDocument()
  })

  it('picks a day from the table too', async () => {
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }))
    fireEvent.click(screen.getByRole('button', { name: 'Thursday, November 26' }))
    expect(screen.getByRole('button', { name: 'Thursday, November 26' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('region', { name: 'Thursday, November 26' })).toHaveTextContent('Quiz 4')
  })
})

describe('the task dialog', () => {
  it('saves a time estimate the student picks', () => {
    window.location.hash = '#assignments'
    render(<App />)
    act(() => useUiStore.getState().openDialog({ type: 'task', id: 'essay' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit task' })
    fireEvent.change(within(dialog).getByLabelText('Time needed (optional)'), { target: { value: '45' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save task' }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'essay')?.estimate).toBe(45)
  })

  it('leaves a saved estimate alone where it cannot be kept', () => {
    useTaskStore.getState().updateTask('essay', { estimate: 60 })
    useSyncStore.setState({ accountId: 'a1', features: [] })
    render(<TaskDialog id="essay" />)
    expect(screen.queryByLabelText('Time needed (optional)')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }))
    expect(useTaskStore.getState().tasks.find((t) => t.id === 'essay')?.estimate).toBe(60)
  })
})
