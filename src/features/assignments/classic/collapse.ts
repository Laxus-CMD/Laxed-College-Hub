import type { Urgency } from '@/types'
import { readDevice, writeDevice } from '@/lib/storage'
import { URGENCY_ORDER } from '@/features/assignments/urgency'

/** Which Classic groups are folded, in this browser. A preference, not student data. */
export const CLASSIC_KEY = 'college-hub.tasks.classic'

/** Finished work stays out of the way until asked for. */
const DEFAULT: Urgency[] = ['done']

export function readCollapsed(): Urgency[] {
  try {
    const s = JSON.parse(readDevice(CLASSIC_KEY) ?? 'null') as { v?: number; collapsed?: unknown }
    if (s?.v === 1 && Array.isArray(s.collapsed)) return URGENCY_ORDER.filter((u) => (s.collapsed as unknown[]).includes(u))
  } catch {
    // Unreadable: the default.
  }
  return DEFAULT
}

export const writeCollapsed = (collapsed: Urgency[]) => writeDevice(CLASSIC_KEY, JSON.stringify({ v: 1, collapsed }))
