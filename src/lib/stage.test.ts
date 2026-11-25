import { describe, expect, it } from 'vitest'
import { fieldsForStage, stageOf } from './stage'

describe('Flow stages', () => {
  it('come from done and progress', () => {
    expect(stageOf({ done: false })).toBe('not-started')
    expect(stageOf({ done: false, progress: 'started' })).toBe('in-progress')
    expect(stageOf({ done: true, progress: 'started' })).toBe('completed')
  })

  it('keep progress when a task is completed, so reopening it returns it to In progress', () => {
    const started = { done: false, progress: 'started' as const }
    const finished = { ...started, ...fieldsForStage('completed') }
    expect(finished).toEqual({ done: true, progress: 'started' })
    // Classic, the calendar and older apps reopen a task by clearing done only.
    expect(stageOf({ ...finished, done: false })).toBe('in-progress')
  })

  it('clear progress when work moves back to Not started', () => {
    expect(fieldsForStage('not-started')).toEqual({ done: false, progress: null })
    expect(fieldsForStage('in-progress')).toEqual({ done: false, progress: 'started' })
  })
})
