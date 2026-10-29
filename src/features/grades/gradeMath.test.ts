import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCALE,
  neededAverage,
  percentToGrade,
  projectCgpa,
  projectFinal,
  requiredTermGpa,
  summarize,
  termGpa,
} from './gradeMath'

const comps = [
  { id: 'a', weight: 20, score: 88 },
  { id: 'b', weight: 30, score: 76 },
  { id: 'c', weight: 30, score: null },
  { id: 'd', weight: 20, score: null },
]

describe('summarize', () => {
  it('banks points on graded work only', () => {
    const s = summarize(comps)
    expect(s.totalWeight).toBe(100)
    expect(s.gradedWeight).toBe(50)
    expect(s.remainingWeight).toBe(50)
    expect(s.earnedPoints).toBeCloseTo(40.4)
    expect(s.average).toBeCloseTo(80.8)
    expect(s.lockedPercent).toBeCloseTo(40.4)
  })

  it('has no average before anything is graded', () => {
    expect(summarize([{ id: 'x', weight: 50, score: null }]).average).toBeNull()
    expect(summarize([]).totalWeight).toBe(0)
  })
})

describe('neededAverage', () => {
  it('says what to average on the rest', () => {
    const n = neededAverage(comps, 82)
    expect(n.status).toBe('needs')
    if (n.status === 'needs') expect(n.average).toBeCloseTo(83.2)
  })

  it('knows when a target is locked in or out of reach', () => {
    expect(neededAverage(comps, 30).status).toBe('locked')
    const hard = neededAverage(comps, 99)
    expect(hard.status).toBe('impossible')
    if (hard.status === 'impossible') expect(hard.bestPossible).toBeCloseTo(90.4)
  })

  it('reports the final grade when everything is graded', () => {
    const done = comps.map((c) => ({ ...c, score: 90 }))
    const n = neededAverage(done, 94)
    expect(n.status).toBe('complete')
    if (n.status === 'complete') expect(n.finalPercent).toBeCloseTo(90)
    expect(neededAverage([], 90).status).toBe('empty')
  })
})

describe('projectFinal', () => {
  it('uses the current average for anything unset', () => {
    expect(projectFinal(comps)).toBeCloseTo(80.8)
  })

  it('applies what-if scores', () => {
    expect(projectFinal(comps, { c: 100, d: 100 })).toBeCloseTo(40.4 + 50)
    expect(projectFinal(comps, { c: 0, d: 0 })).toBeCloseTo(40.4)
    expect(projectFinal([])).toBeNull()
  })
})

describe('percentToGrade', () => {
  it('follows the cutoffs, inclusive at the boundary', () => {
    expect(percentToGrade(94)).toBe(4)
    expect(percentToGrade(93.9)).toBe(3.5)
    expect(percentToGrade(60)).toBe(1)
    expect(percentToGrade(59.9)).toBe(0)
    expect(percentToGrade(85, [{ grade: 4, min: 80 }])).toBe(4)
    expect(DEFAULT_SCALE).toHaveLength(7)
  })
})

describe('GPA math', () => {
  it('weights term GPA by units and skips ungraded courses', () => {
    const t = termGpa([
      { units: 3, grade: 4 },
      { units: 3, grade: 3 },
      { units: 4, grade: null },
      { units: 0, grade: 4 },
    ])
    expect(t.units).toBe(6)
    expect(t.gpa).toBeCloseTo(3.5)
    expect(termGpa([]).gpa).toBeNull()
  })

  it('projects a cumulative GPA', () => {
    const c = projectCgpa(3.4, 36, { points: 21, units: 6 })
    expect(c).toBeCloseTo((3.4 * 36 + 21) / 42)
    expect(projectCgpa(0, 0, { points: 0, units: 0 })).toBeNull()
  })

  it('finds the term GPA needed for a target', () => {
    const need = requiredTermGpa(3.5, 3.4, 36, 18)
    expect(need).toBeCloseTo((3.5 * 54 - 3.4 * 36) / 18)
    expect(requiredTermGpa(3.5, 3.4, 36, 0)).toBeNull()
    expect(requiredTermGpa(4, 3, 30, 15)).toBeGreaterThan(4)
  })
})
