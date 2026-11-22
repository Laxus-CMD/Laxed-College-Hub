import { Monitor, Moon, Palette, Sun } from 'lucide-react'
import type { ComponentType } from 'react'
import { IconButton } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { ModePreference } from '@/lib/themes'
import { useResolvedMode, useThemeStore } from '@/store/useThemeStore'
import { useUiStore } from '@/store/useUiStore'

const OPTIONS: { value: ModePreference; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

/** Light, Dark or System, as a segmented control. "wide" shows the labels where there is room. */
export function ThemeSegmented({ showLabels = false, className }: { showLabels?: boolean | 'wide'; className?: string }) {
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)
  return (
    <div role="radiogroup" aria-label="Light or dark" className={cn('flex gap-0.5 rounded-[9px] bg-fill-strong p-0.5', className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={showLabels === true ? undefined : label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200',
              active ? 'bg-thumb text-ink shadow-thumb' : 'text-muted hover:text-ink',
            )}
          >
            <Icon className="size-[15px]" aria-hidden="true" />
            {showLabels ? <span className={cn(showLabels === 'wide' && 'max-sm:hidden')}>{label}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

/** One tap flips between light and dark. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const resolved = useResolvedMode()
  const setTheme = useThemeStore((s) => s.setTheme)
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <IconButton label={`Switch to ${next} mode`} onClick={() => setTheme(next)} className={className}>
      {resolved === 'dark' ? <Sun className="size-[18px]" aria-hidden="true" /> : <Moon className="size-[18px]" aria-hidden="true" />}
    </IconButton>
  )
}

/** Opens the Appearance window. */
export function ThemesButton({ className }: { className?: string }) {
  const openAppearance = useUiStore((s) => s.openAppearance)
  return (
    <IconButton label="Themes" aria-haspopup="dialog" onClick={openAppearance} className={className}>
      <Palette className="size-[18px]" aria-hidden="true" />
    </IconButton>
  )
}
