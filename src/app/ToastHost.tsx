import { useEffect } from 'react'
import { useUiStore } from '@/store/useUiStore'

/** Bottom toast with an optional Undo. Clears itself after a few seconds. */
export function ToastHost() {
  const toast = useUiStore((s) => s.toast)
  const hide = useUiStore((s) => s.hideToast)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(hide, 5500)
    return () => clearTimeout(timer)
  }, [toast, hide])

  if (!toast) return null
  return (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 animate-[pop-in_220ms_var(--ease-apple)] items-center gap-3.5 rounded-full border border-line bg-raised/90 py-2 pr-2 pl-5 text-[13px] font-medium shadow-pop backdrop-blur-xl max-lg:bottom-[calc(76px+env(safe-area-inset-bottom))] dark:border-line-strong"
    >
      <span>{toast.message}</span>
      {toast.undo ? (
        <button
          type="button"
          onClick={() => {
            toast.undo?.()
            hide()
          }}
          className="cursor-pointer rounded-full px-3 py-1 font-semibold text-accent hover:bg-fill"
        >
          Undo
        </button>
      ) : null}
    </div>
  )
}
