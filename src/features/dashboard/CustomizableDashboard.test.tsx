import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { Account } from '@/features/auth/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useTaskStore } from '@/store/useTaskStore'
import { resetStores } from '@/test/seed'
import { defaultLayout, setHidden } from './layout'
import { dashboardKey, useDashboardLayout } from './useDashboardLayout'

const NOW = new Date(2026, 9, 26, 8, 45)
const GUEST_KEY = dashboardKey('guest')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStores(NOW)
  localStorage.removeItem(GUEST_KEY)
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.removeItem(GUEST_KEY)
})

/** Widgets in the order they appear on the page. */
const onPage = () => [...document.querySelectorAll('[data-widget]')].map((e) => e.getAttribute('data-widget'))
const customize = () => fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
const bar = () => screen.getByRole('region', { name: 'Dashboard editing' })

describe('customizing the dashboard', () => {
  it('shows no editing controls until Customize, then handles for every widget', () => {
    render(<App />)
    expect(onPage()).toEqual(['next-class', 'tasks', 'today', 'pomodoro', 'next-7-days', 'term-gpa', 'recent-notes'])
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()

    customize()
    expect(bar()).toHaveTextContent('Editing dashboard')
    expect(within(bar()).getByRole('button', { name: 'Done' })).toHaveFocus()
    expect(screen.getAllByRole('button', { name: /^Move / }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move Next class',
      'Move Tasks',
      'Move Today',
      'Move Pomodoro timer',
      'Move Next 7 days',
      'Move Term GPA',
      'Move Recent notes',
    ])
    // Widget content cannot be used while editing, so a drag never presses its buttons.
    const checkbox = screen.getByRole('checkbox', { name: /Mark done: Fix edge case/ })
    expect(checkbox.closest('[inert]')).not.toBeNull()
  })

  it('returns to the normal dashboard with Done, keeping the changes', async () => {
    render(<App />)
    customize()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Term GPA' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('region', { name: 'Dashboard editing' })).not.toBeInTheDocument()
    expect(onPage()).not.toContain('term-gpa')
    expect(screen.getByRole('checkbox', { name: /Mark done: Fix edge case/ }).closest('[inert]')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Customize' })).toHaveFocus())
  })

  it('hides and shows widgets from Manage widgets without touching any data', () => {
    render(<App />)
    const before = useTaskStore.getState().tasks
    customize()
    fireEvent.click(within(bar()).getByRole('button', { name: /Manage widgets/ }))
    const tasksSwitch = within(bar()).getByRole('switch', { name: 'Tasks' })
    expect(tasksSwitch).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(tasksSwitch)
    expect(tasksSwitch).toHaveAttribute('aria-checked', 'false')
    expect(onPage()).not.toContain('tasks')
    expect(within(bar()).getByRole('button', { name: /Manage widgets/ })).toHaveTextContent('6/7')
    expect(useTaskStore.getState().tasks).toBe(before)
    // Back in the same place.
    fireEvent.click(tasksSwitch)
    expect(onPage()).toEqual(['next-class', 'tasks', 'today', 'pomodoro', 'next-7-days', 'term-gpa', 'recent-notes'])
  })

  it('keeps the timer running while the Pomodoro is hidden', () => {
    const timer = JSON.stringify({ v: 2, preset: 'classic', custom: { focus: 25, break: 5 }, timer: { phase: 'focus', durationMs: 1_500_000, remainingMs: 1_500_000, endsAt: NOW.getTime() + 600_000 } })
    localStorage.setItem('college-hub.pomodoro', timer)
    render(<App />)
    customize()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Pomodoro timer' }))
    expect(onPage()).not.toContain('pomodoro')
    expect(localStorage.getItem('college-hub.pomodoro')).toBe(timer)
    localStorage.removeItem('college-hub.pomodoro')
  })

  it('asks before resetting, then restores the default and says so', () => {
    render(<App />)
    customize()
    const reset = within(bar()).getByRole('button', { name: 'Reset to default' })
    expect(reset).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Tasks' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide Today' }))
    expect(reset).toBeEnabled()
    fireEvent.click(reset)
    const confirm = within(bar()).getByRole('group', { name: 'Reset to default?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(onPage()).not.toContain('tasks')

    fireEvent.click(within(bar()).getByRole('button', { name: 'Reset to default' }))
    fireEvent.click(within(within(bar()).getByRole('group', { name: 'Reset to default?' })).getByRole('button', { name: 'Reset' }))
    expect(onPage()).toEqual(['next-class', 'tasks', 'today', 'pomodoro', 'next-7-days', 'term-gpa', 'recent-notes'])
    expect(screen.getByText('Dashboard reset to the default layout. Your data is unchanged.')).toBeInTheDocument()
    expect(localStorage.getItem(GUEST_KEY)).toBeNull()
  })

  it('shows a saved order and visibility after a reload', () => {
    const custom = setHidden(
      { ...defaultLayout(), zones: { primary: ['tasks', 'next-class'], secondary: ['pomodoro', 'today'], tiles: ['recent-notes', 'term-gpa', 'next-7-days'] } },
      'term-gpa',
      true,
    )
    localStorage.setItem(GUEST_KEY, JSON.stringify(custom))
    const first = render(<App />)
    expect(onPage()).toEqual(['tasks', 'next-class', 'pomodoro', 'today', 'recent-notes', 'next-7-days'])
    first.unmount()
    render(<App />)
    expect(onPage()).toEqual(['tasks', 'next-class', 'pomodoro', 'today', 'recent-notes', 'next-7-days'])
  })

  it('does not open Focus Space with F while editing', () => {
    render(<App />)
    customize()
    act(() => {
      bar().dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    })
    expect(screen.queryByRole('dialog', { name: 'Focus Space' })).not.toBeInTheDocument()
  })

  it('says so when every widget is hidden, and offers the way back', () => {
    let all = defaultLayout()
    for (const id of ['next-class', 'tasks', 'today', 'pomodoro', 'next-7-days', 'term-gpa', 'recent-notes'] as const) all = setHidden(all, id, true)
    localStorage.setItem(GUEST_KEY, JSON.stringify(all))
    render(<App />)
    expect(onPage()).toEqual([])
    expect(screen.getByText('All widgets are hidden')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Customize' })).toHaveLength(2)
  })
})

describe('customizing never loses the Focus Space task', () => {
  const openTask = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enter Focus Space' }))
    return screen.getByRole('textbox', { name: 'Current task' }) as HTMLInputElement
  }
  const closeFocus = () => fireEvent.keyDown(screen.getByRole('dialog', { name: 'Focus Space' }), { key: 'Escape' })
  const taskNow = () => {
    const value = openTask().value
    closeFocus()
    return value
  }

  it('keeps the task through hide and show, a move to another column, and a remount', () => {
    const app = render(<App />)
    fireEvent.change(openTask(), { target: { value: 'Chapter 6 problems' } })
    closeFocus()

    // Hidden and shown again.
    customize()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Pomodoro timer' }))
    expect(onPage()).not.toContain('pomodoro')
    fireEvent.click(within(bar()).getByRole('button', { name: /Manage widgets/ }))
    fireEvent.click(within(bar()).getByRole('switch', { name: 'Pomodoro timer' }))
    fireEvent.click(within(bar()).getByRole('button', { name: 'Done' }))
    expect(taskNow()).toBe('Chapter 6 problems')

    // Moved to the other column (a new parent, so React mounts it again).
    const moved = { ...defaultLayout(), zones: { primary: ['next-class', 'pomodoro', 'tasks'], secondary: ['today'], tiles: ['next-7-days', 'term-gpa', 'recent-notes'] } }
    localStorage.setItem(GUEST_KEY, JSON.stringify(moved))
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: GUEST_KEY })))
    expect(onPage()).toEqual(['next-class', 'pomodoro', 'tasks', 'today', 'next-7-days', 'term-gpa', 'recent-notes'])
    expect(taskNow()).toBe('Chapter 6 problems')

    // Any remount, like the one a cancelled drag across columns causes.
    app.unmount()
    render(<App />)
    expect(taskNow()).toBe('Chapter 6 problems')
  })

  it('shows the next person an empty task after the previous one signs out', () => {
    render(<App />)
    fireEvent.change(openTask(), { target: { value: 'Private: call about my grades' } })
    closeFocus()
    act(() => useAuthStore.getState().signOut())
    act(() => useAuthStore.getState().continueAsGuest())
    expect(taskNow()).toBe('')
  })
})

describe('dashboard layouts per person', () => {
  const ACCOUNT = { id: '00000000-0000-4000-8000-0000000000aa' } as Account

  it('keeps each account\'s layout apart from the guest one', () => {
    useAuthStore.setState({ account: null, guest: true })
    const { result } = renderHook(() => useDashboardLayout())
    act(() => result.current.save(setHidden(result.current.layout, 'tasks', true)))
    expect(result.current.layout.hidden).toEqual(['tasks'])

    act(() => useAuthStore.setState({ account: ACCOUNT, guest: false }))
    expect(result.current.layout.hidden).toEqual([])
    act(() => result.current.save(setHidden(result.current.layout, 'term-gpa', true)))
    expect(JSON.parse(localStorage.getItem(dashboardKey(ACCOUNT.id))!).hidden).toEqual(['term-gpa'])

    act(() => useAuthStore.setState({ account: null, guest: true }))
    expect(result.current.layout.hidden).toEqual(['tasks'])
    localStorage.removeItem(dashboardKey(ACCOUNT.id))
  })
})
