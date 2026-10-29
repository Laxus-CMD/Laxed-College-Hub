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

export const persistStorage = createJSONStorage(() => safeStorage)
