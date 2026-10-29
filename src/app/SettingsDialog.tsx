import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Input, Label } from '@/components/ui/Field'
import { clearAllData, loadDemoData } from '@/store/actions'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useUiStore } from '@/store/useUiStore'

/** Name, plus clearing or restoring the sample data. */
export function SettingsDialog() {
  const close = useUiStore((s) => s.closeDialog)
  const name = useSettingsStore((s) => s.name)
  const setName = useSettingsStore((s) => s.setName)
  const [draft, setDraft] = useState(name)
  const [armed, setArmed] = useState<'clear' | 'restore' | null>(null)

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setName(draft.trim())
    close()
  }

  const confirm = (kind: 'clear' | 'restore') => {
    if (armed !== kind) {
      setArmed(kind)
      return
    }
    close()
    if (kind === 'clear') clearAllData()
    else loadDemoData()
  }

  return (
    <Dialog title="Your data" onClose={close}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Label label="Your name">
          <Input data-autofocus maxLength={30} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Shown in the greeting" />
        </Label>
        <p className="text-[13px] text-muted">
          Courses, classes, tasks, notes and grades are saved in this browser on this device. Nothing is sent anywhere.
        </p>
        <div className="h-px bg-line" />
        <div className="flex flex-wrap gap-2.5">
          <Button size="sm" variant={armed === 'clear' ? 'danger' : 'ghost'} onClick={() => confirm('clear')}>
            {armed === 'clear' ? 'Click again to clear' : 'Clear all data'}
          </Button>
          <Button size="sm" variant={armed === 'restore' ? 'danger' : 'ghost'} onClick={() => confirm('restore')}>
            {armed === 'restore' ? 'Click again to restore' : 'Restore sample data'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="flex-1" />
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
