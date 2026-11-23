import { Profiler } from 'react'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PomodoroCard } from './PomodoroCard'
import { POMODORO_KEY } from './pomodoroState'
import { useFocusTask } from './focusTask'

const MIN = 60_000

beforeEach(() => {
  localStorage.removeItem(POMODORO_KEY)
  useFocusTask.setState({ task: '' })
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
    expect(digits()).toBe('40:00')
    expect(summary()).toBe('40 min focus · 7 min break')
    // The lengths stay tucked away until asked for.
    const adjust = within(card()).getByRole('button', { name: 'Adjust' })
    expect(adjust).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    fireEvent.click(adjust)
    expect(within(card()).getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('slider', { name: 'Focus length' })).toHaveValue('40')
    fireEvent.click(within(card()).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
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

  it('gives the main buttons at least a 44 px touch target, with Reset separate and quieter', () => {
    render(<PomodoroCard />)
    const start = within(card()).getByRole('button', { name: 'Start' })
    const reset = within(card()).getByRole('button', { name: 'Reset' })
    expect(start).toHaveClass('h-12')
    expect(reset).toHaveClass('size-11')
    expect(start).toHaveClass('bg-accent-fill')
    expect(start).not.toHaveAttribute('style')
    expect(start.className).not.toMatch(/shadow|gradient|glow/)
    expect(reset.className).toMatch(/bg-fill/)
  })

  it('counts finished focus sessions for today, including one that ended in the background', () => {
    render(<PomodoroCard />)
    const dots = () => within(card()).getByRole('img').getAttribute('aria-label')
    expect(dots()).toBe('0 focus sessions finished today')
    press('Start')
    vi.setSystemTime(Date.now() + 30 * MIN)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(dots()).toBe('1 focus session finished today')
    // A break does not count. The next focus does.
    press('Start')
    wait(5 * MIN)
    expect(dots()).toBe('1 focus session finished today')
    press('Start')
    wait(25 * MIN)
    expect(dots()).toBe('2 focus sessions finished today')
    expect(within(card()).getByText('2 today')).toBeInTheDocument()
  })

  it('keeps today\'s count after a reload, and starts again the next day', () => {
    const first = render(<PomodoroCard />)
    press('Start')
    wait(25 * MIN)
    press('Start') // Saves the finished focus session along with the break.
    first.unmount()
    const again = render(<PomodoroCard />)
    expect(within(card()).getByRole('img')).toHaveAttribute('aria-label', '1 focus session finished today')
    again.unmount()
    vi.setSystemTime(new Date('2026-11-24T08:00:00'))
    render(<PomodoroCard />)
    expect(within(card()).getByRole('img')).toHaveAttribute('aria-label', '0 focus sessions finished today')
  })

  it('slows its refresh once a phase has ended, keeping the announcement and counting the session once', () => {
    let commits = 0
    render(
      <Profiler id="pomodoro" onRender={() => (commits += 1)}>
        <PomodoroCard />
      </Profiler>,
    )
    press('Start')
    wait(25 * MIN + 1_000)
    expect(live()).toBe('Focus complete. Time for a break.')
    const dots = () => within(card()).getByRole('img').getAttribute('aria-label')
    expect(dots()).toBe('1 focus session finished today')
    // Nothing is running: at most one more render in two seconds, not eight.
    // One step at a time, as a browser would deliver ticks, so React cannot batch them into one render.
    const before = commits
    for (let i = 0; i < 8; i++) wait(250)
    expect(commits - before).toBeLessThanOrEqual(1)
    expect(live()).toBe('Focus complete. Time for a break.')
    wait(60_000)
    expect(dots()).toBe('1 focus session finished today')
    // Starting the break saves that session, still once.
    press('Start')
    expect(dots()).toBe('1 focus session finished today')
  })

  it('starts fresh from a timer saved by an older version', () => {
    localStorage.setItem(POMODORO_KEY, JSON.stringify({ mode: 'short', remainingMs: 120_000, endsAt: null }))
    render(<PomodoroCard />)
    expect(digits()).toBe('25:00')
    expect(screen.getByRole('radio', { name: '25/5' })).toBeChecked()
  })
})

describe('Focus Space', () => {
  it('shares the deadline and paused time across layouts and leaves typing alone', () => {
    render(<PomodoroCard />)
    press('Start')
    wait(MIN)
    fireEvent.keyDown(document.body, { key: 'f' })
    const space = within(screen.getByRole('dialog', { name: 'Focus Space' }))
    expect(space.getByRole('timer')).toHaveTextContent('24:00')
    wait(MIN)
    const task = space.getByRole('textbox', { name: 'Current task' })
    fireEvent.change(task, { target: { value: 'Read chapter 3' } })
    fireEvent.keyDown(task, { key: 'f' })
    fireEvent.keyDown(task, { key: ' ' })
    expect(space.getByRole('button', { name: 'Pause' })).toBeEnabled()
    fireEvent.keyDown(space.getByRole('heading'), { key: ' ' })
    wait(MIN)
    expect(space.getByRole('timer')).toHaveTextContent('23:00')
    fireEvent.keyDown(space.getByRole('heading'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(within(card()).getByRole('timer')).toHaveTextContent('23:00')
    press('Enter Focus Space')
    expect(screen.getByRole('textbox')).toHaveValue('Read chapter 3')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Resume' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'f' })
    wait(MIN)
    expect(digits()).toBe('22:00')
  })

  it('keeps the viewport fallback when the browser declines and follows native exit', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Fullscreen denied'))
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
    try {
      render(<PomodoroCard />)
      press('Enter Focus Space')
      expect(request).toHaveBeenCalledTimes(1)
      const panel = screen.getByRole('dialog')
      await act(async () => {})
      expect(panel).toBeInTheDocument()
      fireEvent.click(within(panel).getByRole('button', { name: 'Exit Focus Space' }))
      request.mockResolvedValue(undefined)
      press('Enter Focus Space')
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: screen.getByRole('dialog') })
      fireEvent(document, new Event('fullscreenchange'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      Reflect.deleteProperty(document, 'fullscreenElement')
      fireEvent(document, new Event('fullscreenchange'))
      expect(screen.queryByRole('dialog')).toBeNull()
    } finally {
      Reflect.deleteProperty(document, 'fullscreenElement')
      Reflect.deleteProperty(HTMLElement.prototype, 'requestFullscreen')
    }
  })
})
