/**
 * Dashboard customization: which widgets show, and in what order. Plain data and pure
 * functions only. Widgets know nothing about this, and this knows nothing about them
 * beyond their ids. Hiding a widget never touches the data it shows.
 *
 * A layout is a list of widget ids per zone, plus the ids that are hidden. Hidden widgets
 * keep their place, so showing one again puts it back where it was.
 *
 * Versioned so later releases can add, for example, per-widget sizes or named presets
 * by migrating `v: 1` forward instead of starting over.
 */

export const ZONES = ['primary', 'secondary', 'tiles'] as const
export type Zone = (typeof ZONES)[number]

/** Every widget the dashboard can show. Ids are stable: they are saved in people's browsers. */
export const WIDGETS = [
  { id: 'next-class', title: 'Next class', zone: 'primary' },
  { id: 'tasks', title: 'Tasks', zone: 'primary' },
  { id: 'today', title: 'Today', zone: 'secondary' },
  { id: 'pomodoro', title: 'Pomodoro timer', zone: 'secondary' },
  { id: 'next-7-days', title: 'Next 7 days', zone: 'tiles' },
  { id: 'term-gpa', title: 'Term GPA', zone: 'tiles' },
  { id: 'recent-notes', title: 'Recent notes', zone: 'tiles' },
] as const satisfies readonly { id: string; title: string; zone: Zone }[]

export type WidgetId = (typeof WIDGETS)[number]['id']

export interface DashboardLayout {
  v: 1
  zones: Record<Zone, WidgetId[]>
  hidden: WidgetId[]
}

const IDS = new Set<string>(WIDGETS.map((w) => w.id))
const isWidget = (id: unknown): id is WidgetId => typeof id === 'string' && IDS.has(id)

export const titleOf = (id: WidgetId): string => WIDGETS.find((w) => w.id === id)!.title

export function defaultLayout(): DashboardLayout {
  const zones = { primary: [], secondary: [], tiles: [] } as Record<Zone, WidgetId[]>
  for (const w of WIDGETS) zones[w.zone].push(w.id)
  return { v: 1, zones, hidden: [] }
}

/**
 * Makes any saved value safe to use: unknown or repeated ids are dropped, and widgets the
 * saved layout does not know yet (added in a later version) go to the end of their default zone.
 */
export function normalize(raw: unknown): DashboardLayout {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<{ v: unknown; zones: unknown; hidden: unknown }>
  if (saved.v !== 1) return defaultLayout()
  const zonesIn = (saved.zones && typeof saved.zones === 'object' ? saved.zones : {}) as Partial<Record<Zone, unknown>>
  const seen = new Set<WidgetId>()
  const zones = { primary: [], secondary: [], tiles: [] } as Record<Zone, WidgetId[]>
  for (const zone of ZONES) {
    const list = Array.isArray(zonesIn[zone]) ? (zonesIn[zone] as unknown[]) : []
    for (const id of list) {
      if (isWidget(id) && !seen.has(id)) {
        seen.add(id)
        zones[zone].push(id)
      }
    }
  }
  for (const w of WIDGETS) if (!seen.has(w.id)) zones[w.zone].push(w.id)
  const hidden = Array.isArray(saved.hidden) ? [...new Set(saved.hidden.filter(isWidget))] : []
  return { v: 1, zones, hidden }
}

export function zoneOf(layout: DashboardLayout, id: WidgetId): Zone | null {
  return ZONES.find((z) => layout.zones[z].includes(id)) ?? null
}

/** The widgets to show in a zone, in order. */
export const visibleIn = (layout: DashboardLayout, zone: Zone): WidgetId[] => layout.zones[zone].filter((id) => !layout.hidden.includes(id))

/** Every visible widget, in reading order. Phones show exactly this. */
export const readingOrder = (layout: DashboardLayout): WidgetId[] => ZONES.flatMap((z) => visibleIn(layout, z))

/**
 * Moves a widget next to another one, or to the end of a zone. `over` is a widget id or a
 * zone. Moving onto a widget takes its place, pushing it and the rest one step along, so
 * dragging down a list and dragging up it both land where the student let go.
 */
export function moveWidget(layout: DashboardLayout, active: WidgetId, over: WidgetId | Zone): DashboardLayout {
  const from = zoneOf(layout, active)
  if (!from || active === over) return layout
  const to: Zone | null = (ZONES as readonly string[]).includes(over) ? (over as Zone) : zoneOf(layout, over as WidgetId)
  if (!to) return layout
  const zones = { ...layout.zones, [from]: layout.zones[from].filter((id) => id !== active) }
  const target = from === to ? zones[to] : [...layout.zones[to]]
  let index = target.length
  if (!(ZONES as readonly string[]).includes(over)) {
    const overIndex = target.indexOf(over as WidgetId)
    const oldIndex = layout.zones[from].indexOf(active)
    // Same list and moving down: land after the widget it was dropped on.
    index = from === to && oldIndex <= overIndex ? overIndex + 1 : overIndex
  }
  zones[to] = [...target.slice(0, index), active, ...target.slice(index)]
  return { ...layout, zones }
}

export function setHidden(layout: DashboardLayout, id: WidgetId, hidden: boolean): DashboardLayout {
  const rest = layout.hidden.filter((h) => h !== id)
  return { ...layout, hidden: hidden ? [...rest, id] : rest }
}

export const sameLayout = (a: DashboardLayout, b: DashboardLayout) => JSON.stringify(a) === JSON.stringify(b)
