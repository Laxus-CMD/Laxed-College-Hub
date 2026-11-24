import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import { dashboardKey } from '@/features/dashboard/useDashboardLayout'
import { defaultLayout, setHidden } from '@/features/dashboard/layout'
import { POMODORO_KEY } from '@/features/pomodoro/pomodoroState'
import { clearStudyLog, recordSession } from '@/features/study/studyLog'
import { useTaskStore } from '@/store/useTaskStore'
import { resetStores } from '@/test/seed'

// A Saturday morning: no class now or soon, so the hero is in study mode. Next class: Monday 9:15.
const NOW = new Date(2026, 9, 31, 10, 0)
const MIN = 60_000
const KEYS = [POMODORO_KEY, dashboardKey('guest')]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStores(NOW)
  for (const k of KEYS) localStorage.removeItem(k)
  clearStudyLog('guest')
})
afterEach(() => {
  vi.useRealTimers()
  for (const k of KEYS) localStorage.removeItem(k)
  window.location.hash = ''
})

const hero = () => screen.getByRole('region', { name: 'Right now' })
const focusSpace = () => screen.queryByRole('dialog', { name: 'Focus Space' })
const timer = () => JSON.parse(localStorage.getItem(POMODORO_KEY) ?? 'null')?.timer
const logSession = (session: { task: string | null; endedAt: number; focusMs: number }) =>
  recordSession('guest', session)

describe('the study launchpad', () => {
  it('invites the student to study, keeps the next class, and no longer repeats the task list', () => {
    render(<App />)
    expect(within(hero()).getByText('Study mode')).toBeInTheDocument()
    expect(within(hero()).getByRole('heading', { name: 'A little time for yourself.' })).toBeInTheDocument()
    expect(hero()).toHaveTextContent('Pick up where you left off or start something new.')
    expect(hero()).toHaveTextContent('Next class monday at 9:15 AM')
    expect(within(hero()).queryByRole('list')).not.toBeInTheDocument()
    // Nothing studied yet: no invented history.
    expect(hero()).toHaveTextContent('Nothing to pick up yet')
    expect(within(hero()).queryByRole('button', { name: /^Continue/ })).not.toBeInTheDocument()
  })

  it('starts a focus interval in Focus Space, and returns focus to the button after', () => {
    render(<App />)
    const start = within(hero()).getByRole('button', { name: 'Start studying' })
    fireEvent.click(start)
    expect(focusSpace()).toBeInTheDocument()
    expect(timer()).toMatchObject({ phase: 'focus', endsAt: NOW.getTime() + 25 * MIN })
    fireEvent.keyDown(focusSpace()!, { key: 'Escape' })
    expect(focusSpace()).not.toBeInTheDocument()
    expect(start).toHaveFocus()
  })

  it('leaves a running interval alone when starting again', () => {
    const running = { phase: 'break', durationMs: 5 * MIN, remainingMs: 5 * MIN, endsAt: NOW.getTime() + 3 * MIN }
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ v: 2, preset: 'classic', custom: { focus: 25, break: 5 }, timer: running }))
    render(<App />)
    fireEvent.click(within(hero()).getByRole('button', { name: 'Start studying' }))
    expect(focusSpace()).toBeInTheDocument()
    expect(timer()).toEqual(running)
  })

  it('opens Tasks & Assignments', () => {
    render(<App />)
    fireEvent.click(within(hero()).getByRole('button', { name: 'Open tasks' }))
    expect(window.location.hash).toBe('#assignments')
  })

  it('suggests rest once every task is done, and still lets the student study', () => {
    useTaskStore.setState({ tasks: useTaskStore.getState().tasks.map((t) => ({ ...t, done: true })) })
    render(<App />)
    expect(within(hero()).getByRole('heading', { name: 'Great job! Get some rest.' })).toBeInTheDocument()
    expect(within(hero()).queryByRole('button', { name: 'Start studying' })).not.toBeInTheDocument()
    fireEvent.click(within(hero()).getByRole('button', { name: 'Study anyway' }))
    expect(focusSpace()).toBeInTheDocument()
  })

  it('welcomes a student with no tasks at all, instead of congratulating them', () => {
    useTaskStore.setState({ tasks: [] })
    render(<App />)
    expect(within(hero()).getByRole('heading', { name: 'A little time for yourself.' })).toBeInTheDocument()
    expect(hero()).not.toHaveTextContent('Great job')
  })

  it('continues the last session with its task, starting fresh instead of an expired countdown', () => {
    logSession({ task: 'Chapter 6 problems', endedAt: NOW.getTime() - 2 * 60 * MIN, focusMs: 25 * MIN })
    // A focus interval that ran out before that session ended, never touched since.
    const expired = { phase: 'focus', durationMs: 25 * MIN, remainingMs: 25 * MIN, endsAt: NOW.getTime() - 3 * 60 * MIN }
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ v: 2, preset: 'classic', custom: { focus: 25, break: 5 }, timer: expired }))
    render(<App />)
    expect(hero()).toHaveTextContent('Continue where you left off')
    expect(hero()).toHaveTextContent('Chapter 6 problems')
    expect(hero()).toHaveTextContent('25 minutes of focus · Today at 8:00 AM')

    fireEvent.click(within(hero()).getByRole('button', { name: 'Continue: Chapter 6 problems' }))
    expect(within(focusSpace()!).getByRole('textbox', { name: 'Current task' })).toHaveValue('Chapter 6 problems')
    expect(timer()).toMatchObject({ phase: 'focus', endsAt: NOW.getTime() + 25 * MIN })
  })

  it.each([
    ['the tab with the task reports first', ['Chapter 6 problems', null]],
    ['the tab with nothing typed reports first', [null, 'Chapter 6 problems']],
  ] as const)('continues with the typed task when two tabs report one session: %s', (_, [first, second]) => {
    const endedAt = NOW.getTime() - 30 * MIN
    recordSession('guest', { task: first, endedAt, focusMs: 25 * MIN })
    recordSession('guest', { task: second, endedAt, focusMs: 25 * MIN })
    render(<App />)
    fireEvent.click(within(hero()).getByRole('button', { name: 'Continue: Chapter 6 problems' }))
    expect(within(focusSpace()!).getByRole('textbox', { name: 'Current task' })).toHaveValue('Chapter 6 problems')
  })

  it('shows an untitled session plainly, and older sessions by day', () => {
    logSession({ task: null, endedAt: new Date(2026, 9, 29, 21, 30).getTime(), focusMs: 50 * MIN })
    render(<App />)
    expect(hero()).toHaveTextContent('Focus session')
    expect(hero()).toHaveTextContent('50 minutes of focus · Thursday at 9:30 PM')
  })

  it('still starts studying while the timer widget is hidden', () => {
    localStorage.setItem(dashboardKey('guest'), JSON.stringify(setHidden(defaultLayout(), 'pomodoro', true)))
    render(<App />)
    expect(screen.queryByRole('region', { name: 'Pomodoro timer' })).not.toBeInTheDocument()
    fireEvent.click(within(hero()).getByRole('button', { name: 'Start studying' }))
    expect(focusSpace()).toBeInTheDocument()
    expect(timer()).toMatchObject({ phase: 'focus', endsAt: NOW.getTime() + 25 * MIN })
  })

  it('leaves the class-time hero as it was', () => {
    const monday = new Date(2026, 10, 2, 9, 30) // during FNDSTAT
    vi.setSystemTime(monday)
    resetStores(monday)
    render(<App />)
    expect(hero()).toHaveTextContent(/In class now/)
    expect(hero()).not.toHaveTextContent('Study mode')
  })
})
