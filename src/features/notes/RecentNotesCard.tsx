import { Card, CardHeader, EmptyNote } from '@/components/ui/Card'
import { CourseChip } from '@/components/ui/Chip'
import { plainPreview } from '@/lib/markdown'
import { navigate } from '@/lib/route'
import { useCourseMap } from '@/store/selectors'
import { useNoteStore } from '@/store/useNoteStore'
import { useUiStore } from '@/store/useUiStore'

export function RecentNotesCard() {
  const notes = useNoteStore((s) => s.notes)
  const courses = useCourseMap()
  const selectNote = useUiStore((s) => s.selectNote)
  const recent = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3)

  return (
    <Card aria-label="Recent notes">
      <CardHeader
        title="Recent notes"
        actions={
          <button type="button" onClick={() => navigate('notes')} className="cursor-pointer text-[13px] text-accent hover:underline">
            Open notes
          </button>
        }
      />
      {recent.length === 0 ? (
        <EmptyNote>No notes yet.</EmptyNote>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((n) => {
            const course = courses.get(n.courseId ?? '')
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    selectNote(n.id)
                    navigate('notes')
                  }}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-xl bg-canvas px-3.5 py-2.5 text-left hover:bg-white/5"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{n.title || 'Untitled note'}</span>
                    {course ? <CourseChip course={course} /> : null}
                  </span>
                  <span className="truncate text-xs text-muted">{plainPreview(n.body, 90, n.title) || 'Empty note'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
