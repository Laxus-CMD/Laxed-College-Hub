import { formatDuration } from '@/lib/time'

/**
 * The times a student can pick for "Time needed". A short list, so picking is quick and every
 * value is one the student chose: the app never estimates on its own.
 */
export const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480] as const

export const estimateLabel = (minutes: number) => formatDuration(minutes)

/** Short form for tight spaces: 90 to "1.5 h", 45 to "45 min". */
export const estimateShort = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10} h`)
