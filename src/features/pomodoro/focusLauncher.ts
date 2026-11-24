import { create } from 'zustand'

export interface LaunchOptions {
  /** Restore this task in Focus Space. Leave out to keep the current one. */
  task?: string | null
  /** Where keyboard focus goes back to when Focus Space closes. */
  returnTo?: HTMLElement | null
}

/**
 * Opens Focus Space and starts studying, from anywhere on the Overview. The timer card
 * provides it while it is on the page. Call it straight from a click, so the browser
 * still allows full screen.
 */
export const useFocusLauncher = create<{ launch: ((options: LaunchOptions) => void) | null }>()(() => ({ launch: null }))
