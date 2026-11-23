import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastHost } from '@/app/ToastHost'
import { CourseGradesTab } from '@/features/grades/CourseGradesTab'
import { useGradeStore } from '@/store/useGradeStore'
import { useScheduleStore } from '@/store/useScheduleStore'
import { useUiStore } from '@/store/useUiStore'
import { resetStores } from '@/test/seed'

const COURSE = { id: 'c1', code: 'CS 101', name: 'Data Structures', units: 3, color: '#4fd1c5' }

beforeEach(() => {
  resetStores(new Date(2026, 10, 23, 9, 0))
  useScheduleStore.setState({ courses: [COURSE], sessions: [] })
  useGradeStore.setState({
    components: [
      { id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 },
      // Entered before totals existed: a plain percentage.
      { id: 'exam', courseId: 'c1', name: 'Midterm', weight: 40, score: 90 },
      { id: 'proj', courseId: 'c1', name: 'Project', weight: 30, score: null },
    ],
    overrides: {},
    targets: {},
  })
  useUiStore.setState({ toast: null })
})

const view = () =>
  render(
    <>
      <CourseGradesTab />
      <ToastHost />
    </>,
  )
const row = (name: string) => screen.getByRole('textbox', { name: `Points earned for ${name}` }).closest('li')!
const current = () => screen.getByRole('region', { name: 'Current grade' })
const type = (label: string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
const stored = (id: string) => useGradeStore.getState().components.find((c) => c.id === id)

describe('points-based grade entry', () => {
  it('shows each score as entered, what it is worth, and the weighted grade', () => {
    view()
    // 42 out of 50 is 84%, which adds 25.2 points to a component worth 30%.
    expect(row('Quiz 1')).toHaveTextContent('84% · adds 25.2 of 30 points')
    expect(row('Midterm')).toHaveTextContent('90% · adds 36 of 40 points')
    expect(row('Project')).toHaveTextContent('Not graded yet · worth 30% of the grade')
    // (25.2 + 36) / 70 graded
    expect(within(current()).getByText('87.4%')).toBeInTheDocument()
    // Total possible stays empty for old entries, showing the default it uses.
    expect(screen.getByRole('textbox', { name: 'Total possible for Midterm' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Total possible for Midterm' })).toHaveAttribute('placeholder', '100')
  })

  it('keeps points earned, total possible and weight labeled for every row', () => {
    view()
    const quiz = row('Quiz 1')
    expect(within(quiz).getByText('Points earned')).toBeVisible()
    expect(within(quiz).getByText('Total possible')).toBeVisible()
    expect(within(quiz).getByText('Weight')).toBeVisible()
    expect(within(quiz).getByRole('group', { name: 'Score for Quiz 1' })).toContainElement(
      within(quiz).getByRole('textbox', { name: 'Total possible for Quiz 1' }),
    )
    expect(within(quiz).getByRole('group', { name: 'Score for Quiz 1' })).not.toContainElement(
      within(quiz).getByRole('textbox', { name: 'Weight for Quiz 1' }),
    )
  })

  it('recalculates as the student types, across different totals', () => {
    view()
    type('Total possible for Quiz 1', '60')
    expect(row('Quiz 1')).toHaveTextContent('70% · adds 21 of 30 points')
    type('Points earned for Project', '18')
    type('Total possible for Project', '20')
    expect(row('Project')).toHaveTextContent('90% · adds 27 of 30 points')
    // 21 + 36 + 27 out of 100, and with everything graded that is also the final grade.
    expect(within(current()).getAllByText('84.0%')).toHaveLength(2)
    expect(within(current()).getByRole('status')).toHaveTextContent('All components are graded. Final grade 84.0%')
    expect(stored('proj')).toMatchObject({ score: 18, totalScore: 20 })
  })

  it('treats a blank score as not graded and a zero as graded', () => {
    view()
    type('Points earned for Quiz 1', '')
    expect(row('Quiz 1')).toHaveTextContent('Not graded yet')
    expect(stored('quiz')!.score).toBeNull()
    expect(within(current()).getByText('90.0%')).toBeInTheDocument()

    type('Points earned for Quiz 1', '0')
    expect(row('Quiz 1')).toHaveTextContent('0% · adds 0 of 30 points')
    expect(stored('quiz')!.score).toBe(0)
    // 36 out of 70 graded
    expect(within(current()).getByText('51.4%')).toBeInTheDocument()
  })

  it('explains a zero or negative total beside the field and leaves it out of the grade', () => {
    view()
    const total = screen.getByRole('textbox', { name: 'Total possible for Quiz 1' })
    for (const bad of ['0', '-5']) {
      fireEvent.change(total, { target: { value: bad } })
      expect(total).toHaveAttribute('aria-invalid', 'true')
      const error = within(row('Quiz 1')).getByText('Total possible must be more than 0.')
      expect(total.getAttribute('aria-describedby')).toContain(error.id)
      expect(row('Quiz 1')).toHaveTextContent('Fix the box marked in red to count this in your grade.')
      // Never saved, and never used: only the midterm counts.
      expect(stored('quiz')!.totalScore).toBe(50)
      expect(within(current()).getByText('90.0%')).toBeInTheDocument()
    }
    // Still there after leaving the box, until it is fixed.
    fireEvent.blur(total)
    expect(within(row('Quiz 1')).getByText('Total possible must be more than 0.')).toBeInTheDocument()
    fireEvent.change(total, { target: { value: '50' } })
    expect(total).not.toHaveAttribute('aria-invalid')
    expect(within(current()).getByText('87.4%')).toBeInTheDocument()
  })

  it('goes back to the default total when total possible is cleared', () => {
    view()
    type('Total possible for Quiz 1', '')
    // Saved as an explicit null, so the account clears it on purpose (a missing total means "keep").
    expect(stored('quiz')!.totalScore).toBeNull()
    expect(row('Quiz 1')).toHaveTextContent('42% · adds 12.6 of 30 points')
  })

  it('leaves a row with a bad total out of projections and targets, not just the average', () => {
    // Two rows of equal weight: one graded at 90%, one with a total of 0.
    useGradeStore.setState({
      components: [
        { id: 'a', courseId: 'c1', name: 'Exam A', weight: 50, score: 90, totalScore: 100 },
        { id: 'b', courseId: 'c1', name: 'Exam B', weight: 50, score: 30, totalScore: 50 },
      ],
      targets: { c1: 3 },
    })
    view()
    type('Total possible for Exam B', '0')
    const card = current()
    expect(within(card).getByText('90.0%')).toBeInTheDocument()
    expect(card).toHaveTextContent('Leaves out Exam B until the box marked in red is fixed.')
    // It is not "remaining work": no target is worked out over it.
    expect(within(card).getByRole('status')).toHaveTextContent('Fix the box marked in red for Exam B to see what you need on the rest.')
    expect(within(card).getByRole('status')).not.toHaveTextContent(/70|need an average|All components are graded/)
    // And it gets no what-if.
    expect(screen.queryByRole('region', { name: 'What-if' })).not.toBeInTheDocument()
    // Total weight still shows what was entered.
    expect(screen.getByText(/Total weight/)).toHaveTextContent('Total weight 100%')
  })

  it('keeps genuinely ungraded rows in the what-if while a bad row is left out', () => {
    view()
    type('Total possible for Quiz 1', '0')
    const whatIf = screen.getByRole('region', { name: 'What-if' })
    expect(within(whatIf).getByRole('slider', { name: /Project/ })).toBeInTheDocument()
    expect(within(whatIf).queryByRole('slider', { name: /Quiz 1/ })).not.toBeInTheDocument()
    fireEvent.change(within(whatIf).getByRole('slider', { name: /Project/ }), { target: { value: '100' } })
    // Midterm 36 + Project 30, over the 70% of weight that can be counted.
    expect(within(whatIf).getByText('94.3%')).toBeInTheDocument()
    expect(whatIf).toHaveTextContent('Without Quiz 1, final grade would be')
    // Fixing it brings everything back.
    type('Total possible for Quiz 1', '50')
    expect(current()).not.toHaveTextContent('Leaves out')
    expect(within(screen.getByRole('region', { name: 'What-if' })).getByText('91.2%')).toBeInTheDocument()
  })

  it('lets a box be empty while editing, and tidies it afterwards', () => {
    view()
    const weight = screen.getByRole('textbox', { name: 'Weight for Quiz 1' })
    fireEvent.change(weight, { target: { value: '' } })
    expect(weight).toHaveValue('')
    fireEvent.change(weight, { target: { value: '25' } })
    expect(weight).toHaveValue('25')
    expect(stored('quiz')!.weight).toBe(25)
    fireEvent.change(weight, { target: { value: '' } })
    fireEvent.blur(weight)
    expect(weight).toHaveValue('0')
  })

  it('removes a component with a separate control, and Undo in its place brings back all of it', () => {
    view()
    const remove = within(row('Quiz 1')).getByRole('button', { name: 'Remove Quiz 1' })
    expect(remove).toHaveClass('size-11')
    fireEvent.click(remove)
    expect(screen.queryByRole('textbox', { name: 'Points earned for Quiz 1' })).not.toBeInTheDocument()
    // Feedback where it happened, and the keyboard is already on Undo.
    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo.closest('li')).toHaveTextContent('Removed Quiz 1 · 42/50 · 30%')
    expect(undo).toHaveFocus()
    expect(undo).toHaveClass('h-11')
    expect(within(current()).getByText('90.0%')).toBeInTheDocument()

    fireEvent.click(undo)
    expect(useGradeStore.getState().components.map((c) => c.id)).toEqual(['quiz', 'exam', 'proj'])
    expect(stored('quiz')).toEqual({ id: 'quiz', courseId: 'c1', name: 'Quiz 1', weight: 30, score: 42, totalScore: 50 })
    expect(row('Quiz 1')).toHaveTextContent('84% · adds 25.2 of 30 points')
    expect(within(row('Quiz 1')).getByRole('button', { name: 'Remove Quiz 1' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('shows an ungraded removal plainly, and only the latest removal', () => {
    view()
    fireEvent.click(within(row('Project')).getByRole('button', { name: 'Remove Project' }))
    expect(screen.getByRole('button', { name: 'Undo' }).closest('li')).toHaveTextContent('Removed Project · not graded · 30%')
    fireEvent.click(within(row('Midterm')).getByRole('button', { name: 'Remove Midterm' }))
    expect(screen.getAllByRole('button', { name: 'Undo' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Undo' }).closest('li')).toHaveTextContent('Removed Midterm · 90/100 · 40%')
  })

  it('keeps target grades, projections and the what-if working with points', () => {
    view()
    expect(within(current()).getByRole('status')).toHaveTextContent(/average of .* on the remaining 30%/)
    const whatIf = screen.getByRole('region', { name: 'What-if' })
    const slider = within(whatIf).getByRole('slider', { name: /Project/ })
    fireEvent.change(slider, { target: { value: '100' } })
    // 25.2 + 36 + 30
    expect(within(whatIf).getByText('91.2%')).toBeInTheDocument()
  })
})
