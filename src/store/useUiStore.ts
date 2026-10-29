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
  | { type: 'ics' }

export interface Toast {
  message: string
  undo?: () => void
}

/** Screen state that should not be saved: open dialogs, filters, selections. */
interface UiState {
  dialog: DialogState
  openDialog: (d: Exclude<DialogState, null>) => void
  closeDialog: () => void
  drawerSessionId: string | null
  openDrawer: (sessionId: string) => void
  closeDrawer: () => void
  taskCourse: string
  setTaskCourse: (courseId: string) => void
  selectedNoteId: string | null
  selectNote: (id: string | null) => void
  flashTaskId: string | null
  flashTask: (id: string | null) => void
  toast: Toast | null
  showToast: (toast: Toast) => void
  hideToast: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  dialog: null,
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  drawerSessionId: null,
  openDrawer: (drawerSessionId) => set({ drawerSessionId }),
  closeDrawer: () => set({ drawerSessionId: null }),
  taskCourse: '',
  setTaskCourse: (taskCourse) => set({ taskCourse }),
  selectedNoteId: null,
  selectNote: (selectedNoteId) => set({ selectedNoteId }),
  flashTaskId: null,
  flashTask: (flashTaskId) => set({ flashTaskId }),
  toast: null,
  showToast: (toast) => set({ toast }),
  hideToast: () => set({ toast: null }),
}))
