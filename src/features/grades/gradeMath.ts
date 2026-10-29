import type { GradeScaleRow } from '@/types'

/** Grade points on the 4.0 scale used for term and cumulative GPA. */
export const GRADE_POINTS = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0] as const

/**
 * Starting cutoffs for each grade point. These are a placeholder:
 * instructors set the real cutoffs, so the app lets students edit them.
 */
export const DEFAULT_SCALE: GradeScaleRow[] = [
  { grade: 4, min: 94 },
  { grade: 3.5, min: 88 },
  { grade: 3, min: 82 },
  { grade: 2.5, min: 76 },
  { grade: 2, min: 70 },
  { grade: 1.5, min: 64 },
  { grade: 1, min: 60 },
]

export function percentToGrade(percent: number, scale: GradeScaleRow[] = DEFAULT_SCALE): number {
  for (const row of [...scale].sort((a, b) => b.grade - a.grade)) {
    if (percent >= row.min) return row.grade
  }
  return 0
}

export function minPercentFor(grade: number, scale: GradeScaleRow[] = DEFAULT_SCALE): number {
  return scale.find((r) => r.grade === grade)?.min ?? 0
}

export interface ComponentLike {
  id: string
  weight: number
  score: number | null
}

export interface ComponentSummary {
  totalWeight: number
  gradedWeight: number
  remainingWeight: number
  /** Weight points banked so far. A 20% item scored 90 banks 18. */
  earnedPoints: number
  /** Average across graded work only, in percent. Null before anything is graded. */
  average: number | null
  /** Banked points as a percent of the whole course. */
  lockedPercent: number
}

export function summarize(components: ComponentLike[]): ComponentSummary {
  let total = 0
  let graded = 0
  let earned = 0
  for (const c of components) {
    const w = Number.isFinite(c.weight) ? c.weight : 0
    total += w
    if (c.score !== null && Number.isFinite(c.score)) {
      graded += w
      earned += (w * c.score) / 100
    }
  }
  return {
    totalWeight: total,
    gradedWeight: graded,
    remainingWeight: Math.max(0, total - graded),
    earnedPoints: earned,
    average: graded > 0 ? (earned / graded) * 100 : null,
    lockedPercent: total > 0 ? (earned / total) * 100 : 0,
  }
}

export type Need =
  | { status: 'empty' }
  | { status: 'complete'; finalPercent: number }
  | { status: 'locked' }
  | { status: 'impossible'; bestPossible: number }
  | { status: 'needs'; average: number; remainingWeight: number }

/** The average needed on ungraded work to finish at `targetPercent` for the course. */
export function neededAverage(components: ComponentLike[], targetPercent: number): Need {
  const s = summarize(components)
  if (s.totalWeight <= 0) return { status: 'empty' }
  if (s.remainingWeight <= 1e-6) {
    return { status: 'complete', finalPercent: (s.earnedPoints / s.totalWeight) * 100 }
  }
  const needed = (((targetPercent / 100) * s.totalWeight - s.earnedPoints) / s.remainingWeight) * 100
  if (needed <= 0) return { status: 'locked' }
  if (needed > 100) {
    return {
      status: 'impossible',
      bestPossible: ((s.earnedPoints + s.remainingWeight) / s.totalWeight) * 100,
    }
  }
  return { status: 'needs', average: needed, remainingWeight: s.remainingWeight }
}

/**
 * The final percent if ungraded components land at the given hypothetical scores.
 * Anything without a hypothetical uses `fallback`, which defaults to the current average.
 */
export function projectFinal(
  components: ComponentLike[],
  hypotheticals: Record<string, number> = {},
  fallback?: number,
): number | null {
  const s = summarize(components)
  if (s.totalWeight <= 0) return null
  const fill = fallback ?? s.average ?? 0
  let points = 0
  for (const c of components) {
    const score = c.score ?? hypotheticals[c.id] ?? fill
    points += (c.weight * score) / 100
  }
  return (points / s.totalWeight) * 100
}

export interface TermRow {
  units: number
  /** Grade point, or null when the course has no grade yet. */
  grade: number | null
}

export function termGpa(rows: TermRow[]): { gpa: number | null; points: number; units: number } {
  let points = 0
  let units = 0
  for (const r of rows) {
    if (r.grade === null || r.units <= 0) continue
    points += r.grade * r.units
    units += r.units
  }
  return { gpa: units > 0 ? points / units : null, points, units }
}

/** Cumulative GPA after adding this term to a previous record. */
export function projectCgpa(
  prevCgpa: number,
  prevUnits: number,
  term: { points: number; units: number },
): number | null {
  const units = prevUnits + term.units
  return units > 0 ? (prevCgpa * prevUnits + term.points) / units : null
}

/** The term GPA needed to reach `target` cumulative GPA. Can be above 4 or below 0. */
export function requiredTermGpa(
  target: number,
  prevCgpa: number,
  prevUnits: number,
  termUnits: number,
): number | null {
  if (termUnits <= 0) return null
  return (target * (prevUnits + termUnits) - prevCgpa * prevUnits) / termUnits
}
