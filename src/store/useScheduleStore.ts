import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ClassSession, Course } from '@/types'
import { initialDemo } from '@/data/demo'
import { uid } from '@/lib/cn'
import { persistStorage } from '@/lib/storage'

interface ScheduleState {
  courses: Course[]
  sessions: ClassSession[]
  addCourse: (data: Omit<Course, 'id'>) => string
  updateCourse: (id: string, patch: Partial<Omit<Course, 'id'>>) => void
  /** Removes the course and every class session that belongs to it. */
  removeCourse: (id: string) => void
  addSession: (data: Omit<ClassSession, 'id'>) => string
  updateSession: (id: string, patch: Partial<Omit<ClassSession, 'id'>>) => void
  removeSession: (id: string) => void
}

export const useScheduleStore = create<ScheduleState>()(
  persist(
    (set) => ({
      courses: initialDemo().courses,
      sessions: initialDemo().sessions,
      addCourse: (data) => {
        const id = uid('c')
        set((s) => ({ courses: [...s.courses, { ...data, id }] }))
        return id
      },
      updateCourse: (id, patch) =>
        set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCourse: (id) =>
        set((s) => ({
          courses: s.courses.filter((c) => c.id !== id),
          sessions: s.sessions.filter((x) => x.courseId !== id),
        })),
      addSession: (data) => {
        const id = uid('s')
        set((s) => ({ sessions: [...s.sessions, { ...data, id }] }))
        return id
      },
      updateSession: (id, patch) =>
        set((s) => ({ sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
      removeSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),
    }),
    {
      name: 'college-hub.schedule',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ courses: s.courses, sessions: s.sessions }),
    },
  ),
)
