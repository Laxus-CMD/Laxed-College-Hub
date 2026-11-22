import { Check, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { ThemeSegmented } from '@/app/ThemeToggle'
import { closeOnPress, useModalFocus } from '@/components/ui/useModalFocus'
import { cn } from '@/lib/cn'
import { THEMES, themeId, type ThemeId } from '@/lib/themes'
import { useResolvedMode, useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'

/**
 * A tiny app window drawn in one theme. `data-theme` scopes that theme's palette to this element,
 * so it always shows the real colors. It must only use the palette variables, not the app's tokens.
 */
function ThemeThumbnail({ theme }: { theme: ThemeId }) {
  return (
    <span
      data-theme={theme}
      aria-hidden="true"
      className="relative block aspect-[8/5] w-full text-left overflow-hidden rounded-[10px] border border-(--border-default) bg-(--bg-page)"
    >
      <span className="absolute inset-y-0 left-0 flex w-[28%] flex-col gap-[5px] border-r border-(--border-default) bg-(--bg-surface) px-[4%] pt-2">
        <span className="mb-1 flex gap-[3px]">
          <i className="size-[5px] rounded-full bg-[#ff5f57]" />
          <i className="size-[5px] rounded-full bg-[#febc2e]" />
          <i className="size-[5px] rounded-full bg-[#28c840]" />
        </span>
        <i className="h-[7px] rounded-[3px] bg-(--bg-subtle)" />
        <i className="h-[4px] w-4/5 rounded-full bg-(--text-muted) opacity-50" />
        <i className="h-[4px] w-3/5 rounded-full bg-(--text-muted) opacity-50" />
      </span>
      <span className="absolute inset-y-0 right-0 left-[28%] flex flex-col gap-[7px] p-2">
        <span className="text-[11px] leading-none font-semibold tracking-[-0.01em] text-(--text-primary)">Aa</span>
        <span className="flex flex-1 flex-col justify-between rounded-[7px] border border-(--border-default) bg-(--bg-surface) p-[7px]">
          <span className="flex flex-col gap-1">
            <i className="h-[4px] w-4/5 rounded-full bg-(--text-primary)" />
            <i className="h-[4px] w-3/5 rounded-full bg-(--text-muted)" />
          </span>
          <span className="grid h-[13px] w-[38px] place-items-center rounded-full bg-(--accent-primary)">
            <i className="h-[3px] w-[18px] rounded-full bg-(--accent-contrast)" />
          </span>
        </span>
      </span>
    </span>
  )
}

/** Red closes. The other two are there for the look, gray like in any macOS window that cannot do them. */
function TrafficLights({ onClose }: { onClose: () => void }) {
  return (
    <div className="group/lights flex items-center">
      {/* The button is bigger than the dot, so it is easy to hit. */}
      <button type="button" aria-label="Close" title="Close" onClick={onClose} className="grid size-7 cursor-pointer place-items-center rounded-full">
        <span className="grid size-3 place-items-center rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.2)] active:brightness-90">
          <X
            className="size-2 text-black/60 opacity-0 transition-opacity group-hover/lights:opacity-100 pointer-coarse:opacity-100"
            strokeWidth={4}
            aria-hidden="true"
          />
        </span>
      </button>
      <span aria-hidden="true" className="flex gap-2">
        <i className="size-3 rounded-full bg-ink/15" />
        <i className="size-3 rounded-full bg-ink/15" />
      </span>
    </div>
  )
}

function AppearanceWindow({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const group = useId()
  const family = useThemeStore((s) => s.family)
  const setFamily = useThemeStore((s) => s.setFamily)
  const mode = useResolvedMode()
  const onKeyDown = useModalFocus(panel, onClose)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      <div
        data-testid="appearance-backdrop"
        className="absolute inset-0 animate-[fade-in_180ms_ease-out] bg-black/20 dark:bg-black/45"
        onMouseDown={closeOnPress(onClose)}
        aria-hidden="true"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-[680px] animate-[window-in_360ms_var(--ease-spring)] flex-col overflow-hidden rounded-[18px] border border-line-strong/60 bg-surface/75 shadow-window backdrop-blur-[24px] backdrop-saturate-150 outline-none"
      >
        <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-line-strong/50 py-2 pr-2.5 pl-2">
          <TrafficLights onClose={onClose} />
          <h2 id={titleId} className="text-[13px] font-semibold tracking-[-0.005em]">
            Appearance
          </h2>
          <ThemeSegmented showLabels="wide" className="justify-self-end" />
        </header>
        <fieldset className="m-0 min-h-0 overflow-y-auto border-0 p-5 sm:p-6">
          <legend className="sr-only">Theme</legend>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-5 sm:gap-x-5">
            {THEMES.map((t) => {
              const selected = t.id === family
              return (
                <label
                  key={t.id}
                  className="group/card w-[calc((100%-1rem)/2)] cursor-pointer text-center sm:w-[calc((100%-2.5rem)/3)]"
                >
                  <input
                    type="radio"
                    name={group}
                    value={t.id}
                    checked={selected}
                    data-autofocus={selected ? '' : undefined}
                    onChange={() => setFamily(t.id)}
                    className="peer sr-only"
                    aria-label={`${t.name}, ${t[mode]}`}
                  />
                  <span
                    className={cn(
                      'relative block rounded-[10px] outline-2 outline-offset-[3px] transition-transform duration-200 ease-apple group-active/card:scale-[0.97]',
                      selected
                        ? 'outline-(--accent-primary)'
                        : 'outline-transparent group-hover/card:-translate-y-0.5',
                    )}
                  >
                    <ThemeThumbnail theme={themeId(t.id, mode)} />
                    {selected ? (
                      <span className="absolute -right-2 -bottom-2 grid size-[22px] animate-[pop-in_220ms_var(--ease-spring)] place-items-center rounded-full border-2 border-surface bg-accent-fill text-on-accent">
                        <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-3 block text-[13px] leading-tight font-medium">{t.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{t[mode]}</span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </div>
    </div>
  )
}

/** Shows the Appearance window when it is open, over whatever else is on screen. */
export function AppearanceHost() {
  const open = useUiStore((s) => s.appearanceOpen)
  const close = useUiStore((s) => s.closeAppearance)
  return open ? <AppearanceWindow onClose={close} /> : null
}
