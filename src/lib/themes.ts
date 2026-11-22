/** The theme families. Their colors are in public/themes.css. */
export const THEMES = [
  { id: 'matcha', name: 'Matcha', light: 'Ceremonial Matcha', dark: 'Roasted Hojicha' },
  { id: 'monochrome', name: 'Monochrome', light: 'Paper & Ink', dark: 'Noir' },
  { id: 'pink', name: 'Pink', light: 'Soft Blush', dark: 'Velvet Rose' },
  { id: 'coffee', name: 'Coffee', light: 'Oat Latte', dark: 'Dark Espresso' },
  { id: 'navy', name: 'Navy', light: 'Harbor Mist', dark: 'Deep Midnight' },
] as const

export type ThemeFamily = (typeof THEMES)[number]['id']
/** What is showing. */
export type Mode = 'light' | 'dark'
/** What the person chose. "system" follows the device. */
export type ModePreference = Mode | 'system'
/** The value of <html data-theme>. */
export type ThemeId = `${ThemeFamily}-${Mode}`

export const DEFAULT_FAMILY: ThemeFamily = 'matcha'
export const DEFAULT_MODE: ModePreference = 'light'

export const isFamily = (value: unknown): value is ThemeFamily => THEMES.some((t) => t.id === value)
export const isModePreference = (value: unknown): value is ModePreference =>
  value === 'light' || value === 'dark' || value === 'system'

export const themeId = (family: ThemeFamily, mode: Mode): ThemeId => `${family}-${mode}`
