/** Something a popover can sit next to: an element, or a point such as a clicked time slot. */
export interface PopoverAnchor {
  getBoundingClientRect: () => DOMRect | { top: number; bottom: number; left: number; right: number }
}

const MARGIN = 12
const GAP = 6

/** Puts a fixed-position panel below the anchor, or above when there is no room, always inside the window. */
export function placeNear(el: HTMLElement, anchor: PopoverAnchor): void {
  const r = anchor.getBoundingClientRect()
  const w = el.offsetWidth
  const h = el.offsetHeight
  const left = Math.max(MARGIN, Math.min(r.left, window.innerWidth - MARGIN - w))
  let top = r.bottom + GAP
  if (top + h > window.innerHeight - MARGIN && r.top - GAP - h >= MARGIN) top = r.top - GAP - h
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - h))
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  el.style.visibility = 'visible'
}
