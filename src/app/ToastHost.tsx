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
      className="fixed bottom-6 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-3.5 rounded-[14px] border border-line-strong bg-raised py-2.5 pr-3 pl-4 shadow-[0_18px_40px_rgba(0,0,0,0.5)]"
    >
      <span>{toast.message}</span>
      {toast.undo ? (
        <button
          type="button"
          onClick={() => {
            toast.undo?.()
            hide()
          }}
          className="cursor-pointer rounded-lg px-2 py-1 font-medium text-accent hover:bg-white/8"
        >
          Undo
        </button>
      ) : null}
    </div>
  )
}
