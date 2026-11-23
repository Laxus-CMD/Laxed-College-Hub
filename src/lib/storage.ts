import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'

/**
 * Whether the browser accepted the last thing written to it. False after private
 * mode, a full disk or a policy refused a write, so the app can say that what is
 * on screen will not survive a reload.
 */
export const useStorageHealth = create<{ ok: boolean }>()(() => ({ ok: true }))

const healthy = (ok: boolean) => {
  if (useStorageHealth.getState().ok !== ok) useStorageHealth.setState({ ok })
}

/**
 * localStorage that never throws. If the browser blocks storage (private mode,
 * full disk), the app keeps working and just forgets on reload.
 */
const memory = new Map<string, string>()

const safeStorage: Storage = {
  get length() {
    return memory.size
  },
  clear() {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
    memory.clear()
  },
  getItem(key) {
    // Only writes the browser refused are kept here, so they are newer than its copy.
    if (memory.has(key)) return memory.get(key)!
    try {
      return localStorage.getItem(key)
    } catch {
      return memory.get(key) ?? null
    }
  },
  key(index) {
    return [...memory.keys()][index] ?? null
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
    memory.delete(key)
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value)
      memory.delete(key)
      healthy(true)
    } catch {
      memory.set(key, value)
      healthy(false)
    }
  },
}

/** Always kept in this browser: the theme and who is signed in. */
export const persistStorage = createJSONStorage(() => safeStorage)

let onDevice = true
/** False while an account is open. Its data belongs on the server and must not be left in the browser. */
export function setDeviceStorage(on: boolean): void {
  onDevice = on
}

/** Straight to the browser's copy, even while an account is open. Only for importing and removing guest data. */
export const readDevice = (key: string): string | null => safeStorage.getItem(key)
export const writeDevice = (key: string, value: string): void => safeStorage.setItem(key, value)
export const removeDevice = (key: string): void => safeStorage.removeItem(key)

/** For schedules, tasks, notes and grades. Reads and writes the browser for guests only. */
export const studentStorage = createJSONStorage(() => ({
  getItem: (key) => (onDevice ? safeStorage.getItem(key) : null),
  setItem: (key, value) => {
    if (onDevice) safeStorage.setItem(key, value)
  },
  removeItem: (key) => {
    if (onDevice) safeStorage.removeItem(key)
  },
}))
