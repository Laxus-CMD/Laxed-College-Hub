import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Note } from '@/types'
import { initialDemo } from '@/data/demo'
import { uid } from '@/lib/cn'
import { persistStorage } from '@/lib/storage'

type NewNote = Partial<Pick<Note, 'title' | 'body' | 'courseId' | 'sessionId' | 'sessionDate'>>

interface NoteState {
  notes: Note[]
  addNote: (data?: NewNote) => string
  updateNote: (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => void
  removeNote: (id: string) => void
  unlinkCourse: (courseId: string) => void
  unlinkSession: (sessionId: string) => void
}

export const useNoteStore = create<NoteState>()(
  persist(
    (set) => ({
      notes: initialDemo().notes,
      addNote: (data = {}) => {
        const id = uid('n')
        const now = new Date().toISOString()
        set((s) => ({
          notes: [{ title: '', body: '', ...data, id, createdAt: now, updatedAt: now }, ...s.notes],
        }))
        return id
      },
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n,
          ),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      unlinkCourse: (courseId) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.courseId === courseId
              ? { ...n, courseId: undefined, sessionId: undefined, sessionDate: undefined }
              : n,
          ),
        })),
      unlinkSession: (sessionId) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.sessionId === sessionId ? { ...n, sessionId: undefined, sessionDate: undefined } : n,
          ),
        })),
    }),
    {
      name: 'college-hub.notes',
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ notes: s.notes }),
    },
  ),
)
