import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Task } from '@/types'
import { initialDemo } from '@/data/demo'
import { uid } from '@/lib/cn'
import { persistStorage } from '@/lib/storage'

interface TaskState {
  tasks: Task[]
  addTask: (data: Omit<Task, 'id' | 'done' | 'source'> & Partial<Pick<Task, 'done' | 'source'>>) => string
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void
  toggleTask: (id: string) => void
  removeTask: (id: string) => void
  /** Adds imported tasks and skips any whose externalId is already here. Returns how many were added. */
  importTasks: (items: Omit<Task, 'id' | 'done' | 'source'>[]) => number
  /** Keeps tasks but detaches them from a deleted course. */
  unlinkCourse: (courseId: string) => void
}

export const useTaskStore = create<TaskState>()(
  persist(
    (set, get) => ({
      tasks: initialDemo().tasks,
      addTask: (data) => {
        const id = uid('t')
        set((s) => ({ tasks: [...s.tasks, { done: false, source: 'manual', ...data, id }] }))
        return id
      },
      updateTask: (id, patch) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
      toggleTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      importTasks: (items) => {
        const seen = new Set(get().tasks.map((t) => t.externalId).filter(Boolean))
        const fresh = items.filter((i) => i.externalId && !seen.has(i.externalId))
        if (fresh.length === 0) return 0
        set((s) => ({
          tasks: [...s.tasks, ...fresh.map((i) => ({ ...i, id: uid('t'), done: false, source: 'ics' as const }))],
        }))
        return fresh.length
      },
      unlinkCourse: (courseId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.courseId === courseId ? { ...t, courseId: undefined } : t)),
        })),
    }),
    {
      name: 'college-hub.tasks',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ tasks: s.tasks }),
    },
  ),
)
