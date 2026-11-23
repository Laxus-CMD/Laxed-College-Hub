import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PomodoroCard } from './PomodoroCard'
import { POMODORO_KEY } from './pomodoroState'

const MIN = 60_000

beforeEach(() => {
  localStorage.removeItem(POMODORO_KEY)
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(new Date('2026-11-23T08:00:00'))
})
afterEach(() => {
  vi.useRealTimers()
  localStorage.removeItem(POMODORO_KEY)
})

const card = () => screen.getByRole('region', { name: 'Pomodoro timer' })
const digits = () => screen.getByRole('timer').textContent
const ringLeft = () => Number(screen.getByTestId('pomodoro-ring').getAttribute('data-left'))
const press = (name: string) => fireEvent.click(within(card()).getByRole('button', { name }))
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const live = () => card().querySelector('[aria-live="polite"]')!.textContent
const summary = () => within(card()).getByText(/min focus · /).textContent

describe('Pomodoro timer', () => {
  it('starts a 25-minute focus session in one action, and pauses, resumes and resets', () => {
    render(<PomodoroCard />)
    expect(within(card()).getByText('Focus')).toBeInTheDocument()
    expect(digits()).toBe('25:00')
    expect(summary()).toBe('25 min focus · 5 min break')
    expect(screen.getByRole('radio', { name: '25/5' })).toBeChecked()
    expect(within(card()).getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(ringLeft()).toBe(1)

    press('Start')
    wait(MIN)
    expect(digits()).toBe('24:00')
    expect(ringLeft()).toBeCloseTo(0.96, 3)

    press('Pause')
    wait(2 * MIN)
    expect(digits()).toBe('24:00')
    expect(ringLeft()).toBeCloseTo(0.96, 3)

    press('Resume')
    wait(30_000)
    expect(digits()).toBe('23:30')

    press('Reset')
    expect(digits()).toBe('25:00')
    expect(within(card()).getByRole('button', { name: 'Start' })).toBeInTheDocument()
  })

  it('switches to 50/10 and shows the new length at once before a session starts', () => {
    render(<PomodoroCard />)
    fireEvent.click(screen.getByRole('radio', { name: '50/10' }))
    expect(digits()).toBe('50:00')
    expect(summary()).toBe('50 min focus · 10 min break')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  it('reveals labeled sliders for Custom, applies them, and remembers them after a reload', () => {
    const first = render(<PomodoroCard />)
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    const focus = screen.getByRole('slider', { name: 'Focus length' })
    const pause = screen.getByRole('slider', { name: 'Break length' })
    expect(focus).toHaveAttribute('aria-valuetext', '25 minutes')
    fireEvent.change(focus, { target: { value: '40' } })
    fireEvent.change(pause, { target: { value: '7' } })
    expect(digits()).toBe('40:00')
    expect(summary()).toBe('40 min focus · 7 min break')
    expect(within(card()).getByText('40 min')).toBeInTheDocument()
    expect(focus).toHaveAttribute('aria-valuetext', '40 minutes')

    first.unmount()
    render(<PomodoroCard />)
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeChecked()
    expect(screen.getByRole('slider', { name: 'Focus length' })).toHaveValue('40')
    expect(digits()).toBe('40:00')
  })

  it('keeps the running interval when settings change, says so, and uses them next', () => {
    render(<PomodoroCard />)
    press('Start')
    wait(5 * MIN)
    fireEvent.click(screen.getByRole('radio', { name: '50/10' }))
    expect(digits()).toBe('20:00')
    expect(within(card()).getByText('New lengths start with the next interval.')).toBeVisible()

    wait(20 * MIN)
    expect(within(card()).getByText('Break')).toBeInTheDocument()
    expect(digits()).toBe('10:00')
    expect(within(card()).queryByText('New lengths start with the next interval.')).not.toBeInTheDocument()
  })

  it('moves from focus to break and back, announcing only the phase changes', () => {
    render(<PomodoroCard />)
    press('Start')
    wait(10 * MIN)
    expect(live()).toBe('')

    wait(15 * MIN)
    expect(within(card()).getByText('Break')).toBeInTheDocument()
    expect(digits()).toBe('05:00')
    expect(ringLeft()).toBe(1)
    expect(live()).toBe('Focus complete. Time for a break.')
    // The break waits for the student.
    wait(MIN)
    expect(digits()).toBe('05:00')

    press('Start')
    expect(live()).toBe('')
    wait(5 * MIN)
    expect(within(card()).getByText('Focus')).toBeInTheDocument()
    expect(digits()).toBe('25:00')
    expect(live()).toBe('Break over. Ready to focus.')
  })

  it('stays exact after time away in another tab, with digits and ring in step', () => {
    render(<PomodoroCard />)
    press('Start')
    // The tab sleeps: the clock moves on, but no timers fire.
    vi.setSystemTime(Date.now() + 10 * MIN + 15_000)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(digits()).toBe('14:45')
    expect(ringLeft()).toBeCloseTo((14 * 60 + 45) / (25 * 60), 3)

    // Away for longer than the whole interval: the break is ready, not started.
    vi.setSystemTime(Date.now() + 60 * MIN)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(within(card()).getByText('Break')).toBeInTheDocument()
    expect(digits()).toBe('05:00')
  })

  it('keeps the countdown out of screen reader announcements', () => {
    render(<PomodoroCard />)
    const timer = screen.getByRole('timer')
    expect(timer).not.toHaveAttribute('aria-live')
    expect(timer.closest('[aria-live]')).toBeNull()
  })

  it('gives the main buttons a 44 px touch target, with Reset separate and quieter', () => {
    render(<PomodoroCard />)
    const start = within(card()).getByRole('button', { name: 'Start' })
    const reset = within(card()).getByRole('button', { name: 'Reset' })
    expect(start).toHaveClass('h-11')
    expect(reset).toHaveClass('h-11')
    expect(start.className).toMatch(/bg-accent-fill/)
    expect(reset.className).not.toMatch(/bg-accent-fill/)
  })

  it('starts fresh from a timer saved by an older version', () => {
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ mode: 'short', remainingMs: 120_000, endsAt: null }))
    render(<PomodoroCard />)
    expect(digits()).toBe('25:00')
    expect(screen.getByRole('radio', { name: '25/5' })).toBeChecked()
  })
})
