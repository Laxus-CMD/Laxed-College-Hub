import { createJSONStorage } from 'zustand/middleware'

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
    } catch {
      memory.set(key, value)
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
