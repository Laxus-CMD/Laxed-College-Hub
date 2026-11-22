import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEMES, themeId, type Mode, type ThemeId } from '@/lib/themes'
import { THEME_STORAGE_KEY, useThemeStore } from '@/store/useThemeStore'

const IDS = THEMES.flatMap((t) => (['light', 'dark'] as Mode[]).map((m) => themeId(t.id, m)))
const TOKENS = [
  'bg-page', 'bg-surface', 'bg-subtle', 'border-default', 'text-primary', 'text-secondary', 'text-muted',
  'accent-primary', 'accent-hover', 'accent-contrast', 'accent-text',
]

const css = readFileSync('public/themes.css', 'utf8')
function palette(id: ThemeId): Record<string, string> {
  const block = css.split(`[data-theme='${id}'] {`)[1]?.split('}')[0] ?? ''
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1]!, m[2]!]))
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('theme palettes', () => {
  it.each(IDS)('%s has every color', (id) => {
    expect(Object.keys(palette(id)).sort()).toEqual([...TOKENS].sort())
  })

  it.each(IDS)('%s is readable', (id) => {
    const p = palette(id)
    for (const bg of ['bg-page', 'bg-surface', 'bg-subtle']) {
      for (const text of ['text-primary', 'text-secondary', 'accent-text']) {
        expect(contrast(p[text]!, p[bg]!), `${text} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    for (const button of ['accent-primary', 'accent-hover']) {
      expect(contrast(p['accent-contrast']!, p[button]!), `text on ${button}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})

/** Runs a page's own inline script, as the browser does before the first paint. */
function firstPaint(page: string): string | undefined {
  const code = /<script>([\s\S]*?)<\/script>/.exec(readFileSync(page, 'utf8'))?.[1] ?? ''
  delete document.documentElement.dataset.theme
  document.head.innerHTML = '<meta name="theme-color" content="">'
  new Function(code)()
  return document.documentElement.dataset.theme
}
const save = (state: unknown) => localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ state, version: 1 }))
const systemDark = (matches: boolean) =>
  vi.stubGlobal('matchMedia', () => ({ matches, addEventListener() {}, removeEventListener() {} }))

describe.each(['index.html', 'public/privacy.html', 'public/terms.html'])('before the first paint of %s', (page) => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it.each(IDS)('shows a saved %s', (id) => {
    const [family, theme] = id.split('-')
    save({ family, theme })
    expect(firstPaint(page)).toBe(id)
    if (page === 'index.html') {
      expect(document.querySelector('meta')?.getAttribute('content')).toBe(palette(id)['bg-page'])
    }
  })

  it('starts with Ceremonial Matcha, even on a dark device', () => {
    systemDark(true)
    expect(firstPaint(page)).toBe('matcha-light')
  })

  it('follows the device only when asked to', () => {
    systemDark(true)
    save({ family: 'navy', theme: 'system' })
    expect(firstPaint(page)).toBe('navy-dark')
    systemDark(false)
    expect(firstPaint(page)).toBe('navy-light')
  })

  it.each([
    ['a choice from before there were themes', { theme: 'dark' }, 'matcha-dark'],
    ['unknown values', { family: 'x" y', theme: 'neon' }, 'matcha-light'],
    ['nothing useful', null, 'matcha-light'],
  ])('copes with %s, the same way as the app', async (_what, state, id) => {
    save(state)
    expect(firstPaint(page)).toBe(id)
    await useThemeStore.persist.rehydrate()
    const s = useThemeStore.getState()
    expect(`${s.family}-${s.theme}`).toBe(id)
  })

  it('copes with broken storage', () => {
    localStorage.setItem(THEME_STORAGE_KEY, '{oops')
    expect(firstPaint(page)).toBe('matcha-light')
  })
})
