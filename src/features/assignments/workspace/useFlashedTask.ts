import { useEffect } from 'react'
import { useUiStore } from '@/store/useUiStore'

/**
 * A task opened from elsewhere (search, the dashboard) is scrolled into view and highlighted
 * for a moment, whatever the mode. A mode that hides tasks (a folded group, a collapsed column)
 * reveals the flashed one itself, from `flashTaskId`.
 */
export function useFlashedTask() {
  const flashId = useUiStore((s) => s.flashTaskId)
  const flashTask = useUiStore((s) => s.flashTask)
  useEffect(() => {
    if (!flashId) return
    // After the mode has had a frame to reveal it.
    const frame = requestAnimationFrame(() => document.querySelector(`[data-task-id="${flashId}"]`)?.scrollIntoView?.({ block: 'center' }))
    const timer = setTimeout(() => flashTask(null), 1800)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [flashId, flashTask])
}
