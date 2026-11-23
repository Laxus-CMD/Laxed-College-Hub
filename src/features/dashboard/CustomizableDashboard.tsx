import { useState, type ReactNode } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { EyeOff, GripVertical } from 'lucide-react'
import { Dashboard, LANE, SPLIT, TILES } from '@/components/layout/Dashboard'
import { cn } from '@/lib/cn'
import {
  moveWidget,
  setHidden,
  titleOf,
  visibleIn,
  ZONES,
  zoneOf,
  type DashboardLayout,
  type WidgetId,
  type Zone,
} from '@/features/dashboard/layout'

const ZONE_NAMES: Record<Zone, string> = { primary: 'the main column', secondary: 'the side column', tiles: 'the bottom row' }
const isZone = (id: UniqueIdentifier): id is Zone => (ZONES as readonly UniqueIdentifier[]).includes(id)
const nameOf = (id: UniqueIdentifier) => (isZone(id) ? ZONE_NAMES[id] : titleOf(id as WidgetId))

/** The pointer decides where it is when there is one. The keyboard falls back to the nearest. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  const widgets = hits.filter((h) => !isZone(h.id))
  return widgets.length ? widgets : hits.length ? hits : closestCenter(args)
}

const announcements: Announcements = {
  onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Use the arrow keys to move it, then Space or Enter to drop it. Escape cancels.`,
  onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over ${nameOf(over.id)}.` : `${nameOf(active.id)} is not over a place to drop.`),
  onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} was dropped at ${nameOf(over.id)}.` : `${nameOf(active.id)} was dropped.`),
  onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled. It is back where it was.`,
}

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The dashboard, laid out from a saved layout, with an editing mode for moving and hiding
 * widgets. Uses the same grid rules as every other dashboard, so editing never changes how
 * widgets are sized. Widgets are rendered once, in the same place in both modes, so
 * entering or leaving editing never resets them.
 */
export function CustomizableDashboard({
  layout,
  editing,
  widgets,
  onChange,
}: {
  layout: DashboardLayout
  editing: boolean
  widgets: Record<WidgetId, ReactNode>
  onChange: (layout: DashboardLayout) => void
}) {
  /** While dragging, moves happen here first and are saved once, on drop. */
  const [draft, setDraft] = useState<DashboardLayout | null>(null)
  const [active, setActive] = useState<WidgetId | null>(null)
  const shown = draft ?? layout

  const sensors = useSensors(
    // A small movement first, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const start = ({ active }: DragStartEvent) => {
    setActive(active.id as WidgetId)
    setDraft(layout)
  }
  // Crossing into another column or the bottom row happens while dragging, so the widget makes room there.
  const over = ({ active, over }: DragOverEvent) => {
    if (!over) return
    setDraft((prev) => {
      const current = prev ?? layout
      const from = zoneOf(current, active.id as WidgetId)
      const to = isZone(over.id) ? over.id : zoneOf(current, over.id as WidgetId)
      return from && to && from !== to ? moveWidget(current, active.id as WidgetId, over.id as WidgetId | Zone) : current
    })
  }
  const end = ({ active, over }: DragEndEvent) => {
    let next = draft ?? layout
    if (over && over.id !== active.id) {
      const from = zoneOf(next, active.id as WidgetId)
      const to = isZone(over.id) ? over.id : zoneOf(next, over.id as WidgetId)
      if (from === to) next = moveWidget(next, active.id as WidgetId, over.id as WidgetId | Zone)
    }
    setActive(null)
    setDraft(null)
    onChange(next)
  }
  const cancel = () => {
    setActive(null)
    setDraft(null)
  }

  const primary = visibleIn(shown, 'primary')
  const secondary = visibleIn(shown, 'secondary')
  const tiles = visibleIn(shown, 'tiles')
  const hide = (id: WidgetId) => onChange(setHidden(layout, id, true))

  const zone = (z: Zone, ids: WidgetId[], className: string) => (
    <Lane key={z} zone={z} ids={ids} editing={editing} className={className}>
      {ids.map((id) => (
        <SortableWidget key={id} id={id} editing={editing} onHide={() => hide(id)}>
          {widgets[id]}
        </SortableWidget>
      ))}
    </Lane>
  )

  // Out of editing, an empty column gives its space to the other one.
  const bothLanes = editing || (primary.length > 0 && secondary.length > 0)

  return (
    <div data-dashboard-editing={editing || undefined}>
      <Dashboard>
        <DndContext
          sensors={sensors}
          collisionDetection={collision}
          onDragStart={start}
          onDragOver={over}
          onDragEnd={end}
          onDragCancel={cancel}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'To move this widget, press Space or Enter, use the arrow keys to choose a new place, then press Space or Enter again. Press Escape to cancel.',
            },
          }}
        >
          {bothLanes ? (
            <div className={SPLIT}>
              {zone('primary', primary, LANE)}
              {zone('secondary', secondary, LANE)}
            </div>
          ) : primary.length ? (
            zone('primary', primary, LANE)
          ) : secondary.length ? (
            zone('secondary', secondary, LANE)
          ) : null}
          {tiles.length || editing ? zone('tiles', tiles, TILES) : null}

          <DragOverlay dropAnimation={reducedMotion() ? null : undefined}>
            {active ? (
              <div className="grid size-full place-items-center rounded-2xl border-2 border-accent-fill/50 bg-surface/90 shadow-pop">
                <span className="inline-flex items-center gap-2 text-[15px] font-semibold">
                  <GripVertical className="size-4 text-muted" aria-hidden="true" />
                  {titleOf(active)}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Dashboard>
    </div>
  )
}

/** A column or the bottom row. While editing, an empty one still takes drops. */
function Lane({ zone, ids, editing, className, children }: { zone: Zone; ids: WidgetId[]; editing: boolean; className: string; children: ReactNode }) {
  // Only an empty column is a drop target itself. Otherwise the widgets in it are, so the
  // keyboard always moves to a neighbor instead of to the column as a whole.
  const { setNodeRef, isOver } = useDroppable({ id: zone, disabled: !editing || ids.length > 0 })
  return (
    <SortableContext items={ids} strategy={zone === 'tiles' ? rectSortingStrategy : verticalListSortingStrategy}>
      <div ref={setNodeRef} className={cn(className, 'min-w-0')}>
        {children}
        {editing && ids.length === 0 ? (
          <div
            className={cn(
              'grid min-h-28 place-items-center rounded-2xl border-2 border-dashed px-4 text-center text-[13px] text-muted transition-colors',
              isOver ? 'border-accent-fill/60 bg-accent-fill/5' : 'border-line-strong',
            )}
          >
            Drag a widget here
          </div>
        ) : null}
      </div>
    </SortableContext>
  )
}

/**
 * One widget, with its handle and Hide button while editing. The widget's own content is
 * inert then, so a drag can never press one of its buttons or start its timer.
 */
function SortableWidget({ id, editing, onHide, children }: { id: WidgetId; editing: boolean; onHide: () => void; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing })
  const title = titleOf(id)
  return (
    <div
      ref={setNodeRef}
      data-widget={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative flex min-w-0 flex-col', editing && 'rounded-2xl')}
    >
      <div
        inert={editing}
        className={cn(
          'flex min-w-0 grow flex-col *:grow',
          editing && 'pointer-events-none select-none',
          // The place the widget will land: still there, faded, with a dashed edge.
          isDragging && 'opacity-30',
        )}
      >
        {children}
      </div>
      {editing ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0 rounded-2xl ring-inset transition-[box-shadow] duration-200',
              isDragging ? 'outline-2 -outline-offset-2 outline-dashed outline-accent-fill/60' : 'ring-1 ring-accent-fill/25',
            )}
          />
          {/* Sits on the card's top edge, in the gap above it, so it never covers the widget. */}
          <div className="absolute -top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-surface p-0.5 shadow-thumb">
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Move ${title}`}
              className="inline-flex h-9 cursor-grab touch-none items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-ink transition-colors hover:bg-fill active:cursor-grabbing"
            >
              <GripVertical className="size-4 text-muted" aria-hidden="true" />
              {title}
            </button>
            <button
              type="button"
              aria-label={`Hide ${title}`}
              title={`Hide ${title}`}
              onClick={onHide}
              className="grid size-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-fill hover:text-ink"
            >
              <EyeOff className="size-4" aria-hidden="true" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
