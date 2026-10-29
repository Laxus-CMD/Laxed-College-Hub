import { describe, expect, it } from 'vitest'
import type { Task } from '@/types'
import { compareTasks, dueLabel, getUrgency, groupByUrgency } from './urgency'

const now = new Date(2026, 9, 26, 15, 0) // Mon Oct 26, 3:00 PM

const t = (id: string, due?: string, done = false): Task => ({
  id,
  kind: 'assignment',
  title: id,
  due,
  done,
  source: 'manual',
})

describe('getUrgency', () => {
  it('sorts tasks into the README buckets', () => {
    expect(getUrgency(t('a', '2026-10-26T09:00'), now)).toBe('overdue')
    expect(getUrgency(t('a', '2026-10-25'), now)).toBe('overdue')
    expect(getUrgency(t('a', '2026-10-26T18:00'), now)).toBe('today')
    expect(getUrgency(t('a', '2026-10-26'), now)).toBe('today') // bare date means end of day
    expect(getUrgency(t('a', '2026-10-27'), now)).toBe('this-week')
    expect(getUrgency(t('a', '2026-11-01'), now)).toBe('this-week') // 6 days out
    expect(getUrgency(t('a', '2026-11-02'), now)).toBe('later') // 7 days out
    expect(getUrgency(t('a'), now)).toBe('no-date')
    expect(getUrgency(t('a', '2026-10-20', true), now)).toBe('done')
  })
})

describe('compareTasks and groupByUrgency', () => {
  it('orders by due date, with undated last and done after open', () => {
    const list = [t('none'), t('late', '2026-11-05'), t('done', '2026-10-01', true), t('soon', '2026-10-27')]
    expect(list.sort(compareTasks).map((x) => x.id)).toEqual(['soon', 'late', 'none', 'done'])
  })

  it('groups tasks and keeps each group sorted', () => {
    const g = groupByUrgency(
      [t('b', '2026-10-29'), t('a', '2026-10-27'), t('old', '2026-10-01'), t('x', undefined, true)],
      now,
    )
    expect(g.overdue.map((x) => x.id)).toEqual(['old'])
    expect(g['this-week'].map((x) => x.id)).toEqual(['a', 'b'])
    expect(g.done.map((x) => x.id)).toEqual(['x'])
  })
})

describe('dueLabel', () => {
  it('words the due column', () => {
    expect(dueLabel(t('a', '2026-10-26T18:00'), now)).toEqual({ text: 'Due today at 6:00 PM', tone: 'warn' })
    expect(dueLabel(t('a', '2026-10-26'), now)).toEqual({ text: 'Due today', tone: 'warn' })
    expect(dueLabel(t('a', '2026-10-27'), now).text).toBe('Due tomorrow')
    expect(dueLabel(t('a', '2026-10-29'), now).text).toBe('Due Thu')
    expect(dueLabel(t('a', '2026-10-24'), now)).toEqual({ text: 'Overdue 2 days', tone: 'bad' })
    expect(dueLabel(t('a', '2026-10-26T09:00'), now)).toEqual({ text: 'Overdue today', tone: 'bad' })
    expect(dueLabel(t('a', '2026-12-01'), now).text).toBe('Dec 1')
    expect(dueLabel(t('a', undefined, true), now).text).toBe('Done')
  })
})
