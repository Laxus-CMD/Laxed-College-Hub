import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { Task } from '@/types'
import { resetStores } from '@/test/seed'
import { cleanDoc, readStores } from '@/sync/doc'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useTaskStore } from '@/store/useTaskStore'
import { useUiStore } from '@/store/useUiStore'
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
