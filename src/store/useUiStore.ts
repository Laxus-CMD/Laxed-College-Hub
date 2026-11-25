import { create } from 'zustand'
import type { Weekday } from '@/types'

export type DialogState =
  | null
  | { type: 'task'; id?: string; courseId?: string }
  | { type: 'course'; id?: string }
  | {
      type: 'session'
      id?: string
      preset?: { days: Weekday[]; start: string; end: string; courseId?: string }
    }
  | { type: 'settings' }
  | { type: 'password' }
  | { type: 'delete-account' }
  | { type: 'ics' }
  | { type: 'import' }

export interface Toast {
  message: string
  undo?: () => void
}

/** Screen state that should not be saved: open dialogs, filters, selections. */
interface UiState {
  dialog: DialogState
  openDialog: (d: Exclude<DialogState, null>) => void
  closeDialog: () => void
  /** The Appearance window. Separate from `dialog`, so it can open on top of one. */
  appearanceOpen: boolean
  openAppearance: () => void
  closeAppearance: () => void
  drawerSessionId: string | null
  openDrawer: (sessionId: string) => void
  closeDrawer: () => void
  taskCourse: string
  setTaskCourse: (courseId: string) => void
  selectedNoteId: string | null
  selectNote: (id: string | null) => void
  flashTaskId: string | null
  /** Goes up with every flash, so opening the same task again scrolls to it again. */
  flashCount: number
  flashTask: (id: string | null) => void
  toast: Toast | null
  showToast: (toast: Toast) => void
  hideToast: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  appearanceOpen: false,
  openAppearance: () => set({ appearanceOpen: true }),
  closeAppearance: () => set({ appearanceOpen: false }),
  drawerSessionId: null,
  openDrawer: (drawerSessionId) => set({ drawerSessionId }),
  closeDrawer: () => set({ drawerSessionId: null }),
  taskCourse: '',
  setTaskCourse: (taskCourse) => set({ taskCourse }),
  selectedNoteId: null,
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  flashTaskId: null,
  flashCount: 0,
  flashTask: (flashTaskId) => set((s) => ({ flashTaskId, flashCount: flashTaskId ? s.flashCount + 1 : s.flashCount })),
  toast: null,
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: null }),
}))
