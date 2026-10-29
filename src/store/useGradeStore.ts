import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GradeComponent, GradeScaleRow } from '@/types'
import { initialDemo } from '@/data/demo'
import { uid } from '@/lib/cn'
import { persistStorage } from '@/lib/storage'
import { DEFAULT_SCALE } from '@/features/grades/gradeMath'

interface GradeState {
  components: GradeComponent[]
  scale: GradeScaleRow[]
  /** A grade point picked by hand for a course. Missing means "use the scores". */
  overrides: Record<string, number>
  /** The grade point a student is aiming for, per course. */
  targets: Record<string, number>
  prior: { cgpa: number | null; units: number | null }
  addComponent: (courseId: string) => string
  updateComponent: (id: string, patch: Partial<Omit<GradeComponent, 'id' | 'courseId'>>) => void
  removeComponent: (id: string) => void
  setScaleMin: (grade: number, min: number) => void
  resetScale: () => void
  setOverride: (courseId: string, grade: number | null) => void
  setTarget: (courseId: string, grade: number) => void
  setPrior: (patch: Partial<{ cgpa: number | null; units: number | null }>) => void
  removeCourse: (courseId: string) => void
}

export const useGradeStore = create<GradeState>()(
  persist(
    (set) => ({
      components: initialDemo().components,
      scale: DEFAULT_SCALE.map((r) => ({ ...r })),
      overrides: {},
      targets: {},
      prior: { cgpa: null, units: null },
      addComponent: (courseId) => {
        const id = uid('g')
        set((s) => ({
          components: [...s.components, { id, courseId, name: '', weight: 0, score: null }],
        }))
        return id
      },
      updateComponent: (id, patch) =>
        set((s) => ({ components: s.components.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeComponent: (id) => set((s) => ({ components: s.components.filter((c) => c.id !== id) })),
      setScaleMin: (grade, min) =>
        set((s) => ({ scale: s.scale.map((r) => (r.grade === grade ? { ...r, min } : r)) })),
      resetScale: () => set({ scale: DEFAULT_SCALE.map((r) => ({ ...r })) }),
      setOverride: (courseId, grade) =>
        set((s) => {
          const next = { ...s.overrides }
          if (grade === null) delete next[courseId]
          else next[courseId] = grade
          return { overrides: next }
        }),
      setTarget: (courseId, grade) => set((s) => ({ targets: { ...s.targets, [courseId]: grade } })),
      setPrior: (patch) => set((s) => ({ prior: { ...s.prior, ...patch } })),
      removeCourse: (courseId) =>
        set((s) => {
          const overrides = { ...s.overrides }
          const targets = { ...s.targets }
          delete overrides[courseId]
          delete targets[courseId]
          return { components: s.components.filter((c) => c.courseId !== courseId), overrides, targets }
        }),
    }),
    {
      name: 'college-hub.grades',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({
        components: s.components,
        scale: s.scale,
        overrides: s.overrides,
        targets: s.targets,
        prior: s.prior,
      }),
    },
  ),
)
