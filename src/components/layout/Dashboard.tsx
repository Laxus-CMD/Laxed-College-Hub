import type { ReactNode } from 'react'

/**
 * Dashboard layout, kept apart from the widgets. A widget renders its own content at
 * whatever width it is given; where it goes and how wide it is is decided here and on
 * the page that uses these pieces. To add a widget, put it in a lane or in the tiles.
 *
 *   <Dashboard>
 *     <DashboardSplit primary={<>…</>} secondary={<>…</>} />
 *     <DashboardTiles>…</DashboardTiles>
 *   </Dashboard>
 *
 * - Breakpoints follow the dashboard's own width (container queries), not the window,
 *   so a wider or narrower sidebar, a smaller window or browser zoom all lay out the same way.
 * - Widgets keep their natural height. The one exception: side by side, the last widget in
 *   the shorter lane grows so both lanes end on the same line (see DashboardSplit).
 * - The order in the page is the order of importance. On a phone everything is one column
 *   in that order, and screen readers and the keyboard follow it at every width.
 * - One spacing token, --dash-gap, sets every gap.
 */
/** The grid rules, shared with the customizable dashboard so both lay out the same way. */
export const SPLIT =
  'grid grid-cols-[minmax(0,1fr)] items-start gap-(--dash-gap) @4xl:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)] @4xl:items-stretch'
export const LANE = 'flex min-w-0 flex-col gap-(--dash-gap) @4xl:[&>*:last-child]:flex-1'
export const TILES =
  'grid grid-cols-[repeat(auto-fit,minmax(min(100%,17rem),1fr))] items-start gap-(--dash-gap) @min-[35.25rem]:@max-[53.5rem]:[&>*:last-child:nth-child(odd)]:col-span-full'

export function Dashboard({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="flex flex-col gap-(--dash-gap) [--dash-gap:1.25rem] @4xl:[--dash-gap:1.5rem]">{children}</div>
    </div>
  )
}

/**
 * Two lanes: a wide one for what matters most, and a narrower one beside it for the
 * tools used alongside. Below 56rem of dashboard width the lanes stack, primary first.
 *
 * Side by side, both lanes end on the same line, so whatever comes next starts on a clean
 * boundary: the last widget in the shorter lane takes up the difference. Other widgets
 * keep their natural height. A widget that may end a lane should lay itself out as a
 * column so the extra height lands somewhere sensible (see UpcomingTasksCard's footer).
 */
export function DashboardSplit({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  return (
    <div className={SPLIT}>
      <div className={LANE}>{primary}</div>
      <div className={LANE}>{secondary}</div>
    </div>
  )
}

/**
 * Supporting widgets as equal tiles: one, two or three across, as the width allows.
 * Empty tracks collapse, so a short row still fills the width.
 *
 * When the tiles are exactly two across (dashboard width from 2 × 17rem + gap up to
 * 3 × 17rem + 2 gaps), an odd last tile takes the whole row instead of leaving half of it empty.
 */
export function DashboardTiles({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div
      aria-label={label}
      role={label ? 'group' : undefined}
      className={TILES}
    >
      {children}
    </div>
  )
}
