import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedTabs } from '@/components/ui/Tabs'
import { CourseGradesTab } from '@/features/grades/CourseGradesTab'
import { TermGpaTab } from '@/features/grades/TermGpaTab'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'

type Tab = 'term' | 'course'

export default function GradesPage() {
  const [tab, setTab] = useState<Tab>('term')
  const hasCourses = useScheduleStore((s) => s.courses.length > 0)
  const openDialog = useUiStore((s) => s.openDialog)

  return (
    <>
      <PageHeader title="Grade & GPA Calculator" subtitle="Track scores, then see where your GPA lands." />
      <SegmentedTabs
        label="Calculator"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'term', label: 'Term GPA' },
          { value: 'course', label: 'Course grades' },
        ]}
      />
      <div className="mt-[18px]">
        {!hasCourses ? (
          <Card>
            <p className="text-muted">Add a course to start tracking grades.</p>
            <Button size="sm" variant="primary" className="mt-2.5" onClick={() => openDialog({ type: 'course' })}>
              Add course
            </Button>
          </Card>
        ) : tab === 'term' ? (
          <TermGpaTab />
        ) : (
          <CourseGradesTab />
        )}
      </div>
    </>
  )
}
