import { describe, expect, it } from 'vitest'
import { defaultLayout, moveWidget, normalize, readingOrder, sameLayout, setHidden, visibleIn, WIDGETS } from './layout'

describe('dashboard layout', () => {
  it('starts with the dashboard as designed', () => {
    expect(defaultLayout()).toEqual({
      v: 1,
      zones: { primary: ['next-class', 'tasks'], secondary: ['today', 'pomodoro'], tiles: ['next-7-days', 'term-gpa', 'recent-notes'] },
      hidden: [],
    })
    expect(readingOrder(defaultLayout())).toEqual(WIDGETS.map((w) => w.id))
  })

  it('makes any saved value safe, and adds widgets it has not seen yet to their usual place', () => {
    const saved = {
      v: 1,
      // An unknown id, a repeat, and three widgets left out (as if saved before they existed).
      zones: { primary: ['tasks', 'old-widget', 'tasks'], secondary: ['pomodoro'], tiles: ['term-gpa', 'next-class'] },
      hidden: ['recent-notes', 'nope', 'recent-notes'],
    }
    expect(normalize(saved)).toEqual({
      v: 1,
      zones: { primary: ['tasks'], secondary: ['pomodoro', 'today'], tiles: ['term-gpa', 'next-class', 'next-7-days', 'recent-notes'] },
      hidden: ['recent-notes'],
    })
  })

  it('falls back to the default for anything it cannot read, including another version', () => {
    for (const bad of [null, 'x', 42, [], {}, { v: 2, zones: {}, hidden: [] }, { v: 1, zones: 'nope', hidden: 'nope' }]) {
      const n = normalize(bad)
      expect(readingOrder(n).sort()).toEqual(WIDGETS.map((w) => w.id).sort())
      expect(n.hidden).toEqual([])
    }
  })

  it('moves within a column both ways, landing where it was dropped', () => {
    const d = defaultLayout()
    expect(moveWidget(d, 'next-7-days', 'recent-notes').zones.tiles).toEqual(['term-gpa', 'recent-notes', 'next-7-days'])
    expect(moveWidget(d, 'recent-notes', 'next-7-days').zones.tiles).toEqual(['recent-notes', 'next-7-days', 'term-gpa'])
    expect(moveWidget(d, 'tasks', 'tasks')).toBe(d)
  })

  it('moves across columns, onto a widget or onto an empty column', () => {
    const d = defaultLayout()
    const moved = moveWidget(d, 'pomodoro', 'tasks')
    expect(moved.zones.primary).toEqual(['next-class', 'pomodoro', 'tasks'])
    expect(moved.zones.secondary).toEqual(['today'])
    const empty = { ...d, zones: { ...d.zones, secondary: [] } }
    expect(moveWidget(empty, 'term-gpa', 'secondary').zones.secondary).toEqual(['term-gpa'])
    // Nothing is ever lost or doubled.
    expect(readingOrder(moved).sort()).toEqual(WIDGETS.map((w) => w.id).sort())
  })

  it('hides a widget without losing its place, and shows it there again', () => {
    const hidden = setHidden(defaultLayout(), 'tasks', true)
    expect(visibleIn(hidden, 'primary')).toEqual(['next-class'])
    expect(hidden.zones.primary).toEqual(['next-class', 'tasks'])
    const shown = setHidden(hidden, 'tasks', false)
    expect(sameLayout(shown, defaultLayout())).toBe(true)
  })
})
