import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetStores } from '@/test/seed'
import { useTaskStore } from '@/store/useTaskStore'
import App from './App'

// Monday, October 26 2026, 8:45 AM
const NOW = new Date(2026, 9, 26, 8, 45)

const FEED = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:event-assignment-9001',
  'SUMMARY:Problem Set 4 [FNDSTAT-A]',
  'DTSTART:20261110T080000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:event-assignment-9002',
  'SUMMARY:Essay 2 draft [ENG 102]',
  'DTSTART;VALUE=DATE:20261112',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetStores(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

const user = () => userEvent.setup()

describe('Overview', () => {
  it('shows the hero for a class 30 minutes away, with a greeting and today\'s classes', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /good morning/i })).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: 'Right now' })
    expect(within(hero).getByText('Next class in 30 minutes')).toBeInTheDocument()
    expect(within(hero).getByRole('heading', { name: 'FNDSTAT' })).toBeInTheDocument()
    const today = screen.getByRole('region', { name: 'Today' })
    expect(within(today).getByText('MATH 201')).toBeInTheDocument()
  })

  it('lists open tasks, most urgent first, and counts them', () => {
    render(<App />)
    const tasks = screen.getByRole('region', { name: 'Tasks' })
    expect(within(tasks).getByText('6 open')).toBeInTheDocument()
    const rows = within(tasks).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Fix edge case bug in Binary Search Tree assignment')
    expect(rows[0]).toHaveTextContent('Due today')
  })

  it('marks a task done and updates the count', async () => {
    render(<App />)
    await user().click(screen.getByRole('checkbox', { name: /Mark done: Fix edge case bug/ }))
    expect(within(screen.getByRole('region', { name: 'Tasks' })).getByText('5 open')).toBeInTheDocument()
  })

  it('shows the term GPA from the demo scores', () => {
    render(<App />)
    const gpa = screen.getByRole('region', { name: 'Term GPA' })
    expect(within(gpa).getByText(/^\d\.\d{2}$/)).toBeInTheDocument()
  })

  it('clears the sample data from the banner, with undo', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('button', { name: 'Clear sample data' }))
    expect(screen.queryByText(/looking at sample data/i)).not.toBeInTheDocument()
    expect(screen.getByText(/All clear/)).toBeInTheDocument()
    expect(screen.getByText('Sample data cleared.')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Undo' }))
    expect(within(screen.getByRole('region', { name: 'Tasks' })).getByText('6 open')).toBeInTheDocument()
  })
})

describe('Navigation and search', () => {
  it('opens every page from the menu', async () => {
    const u = user()
    render(<App />)
    const pages: [string, string][] = [
      ['Weekly Schedule', 'Weekly Schedule'],
      ['Tasks & Assignments', 'Tasks & Assignments'],
      ['Grade & GPA Calculator', 'Grade & GPA Calculator'],
      ['Notes', 'Notes'],
      ['Overview', 'Good morning'],
    ]
    for (const [link, heading] of pages) {
      await u.click(screen.getByRole('link', { name: link }))
      expect(await screen.findByRole('heading', { level: 1, name: new RegExp(heading, 'i') })).toBeInTheDocument()
    }
  })

  it('finds a task from search and jumps to it', async () => {
    const u = user()
    render(<App />)
    await u.type(screen.getByRole('combobox'), 'binary')
    await u.click(await screen.findByRole('option', { name: /Binary Search Tree/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tasks & Assignments' })).toBeInTheDocument()
  })
})

describe('Schedule', () => {
  it('draws classes on the grid and opens the drawer with notes for that class', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Weekly Schedule' }))
    const monday = (await screen.findAllByRole('button', { name: /FNDSTAT, 9:15 to 10:45 AM, UH 310/ }))[0]!
    await u.click(monday)
    const drawer = await screen.findByRole('dialog', { name: 'FNDSTAT' })
    expect(within(drawer).getByText('Mon, Thu, 9:15 to 10:45 AM')).toBeInTheDocument()
    expect(within(drawer).getByText('Probability distributions')).toBeInTheDocument()
    expect(within(drawer).getByText('Prof. Reyes')).toBeInTheDocument()
  })

  it('adds a class on two days and warns about an overlap', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Weekly Schedule' }))
    await u.click(screen.getByRole('button', { name: 'Add class' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add class' })
    await u.selectOptions(within(dialog).getByLabelText('Course'), 'c-cs101')
    // Mon is already a day; add Thursday at a time that overlaps FNDSTAT
    await u.click(within(dialog).getByRole('checkbox', { name: 'Thu' }))
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: '09:30' } })
    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: '10:30' } })
    expect(await within(dialog).findByRole('status')).toHaveTextContent(/overlaps with FNDSTAT on Mon, FNDSTAT on Thu/)
    await u.click(within(dialog).getByRole('button', { name: 'Add class' }))
    expect(await screen.findAllByRole('button', { name: /CS 101, 9:30 to 10:30 AM/ })).toHaveLength(2)
  })
})

describe('Tasks', () => {
  it('adds a task from the quick bar and groups it by urgency', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Tasks & Assignments' }))
    const form = await screen.findByRole('form', { name: 'Add a task' })
    await u.type(within(form).getByLabelText('Task title'), 'Email the professor{Enter}')
    expect(await screen.findByText('Email the professor')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'No due date' })).toHaveTextContent('Email the professor')
  })

  it('shows overdue work in its own group', async () => {
    const u = user()
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Missed reading', due: '2026-10-20T23:59' })
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Tasks & Assignments' }))
    const group = await screen.findByRole('region', { name: 'Overdue' })
    expect(group).toHaveTextContent('Missed reading')
    expect(group).toHaveTextContent('Overdue 6 days')
  })

  it('deletes a task and brings it back with Undo', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Tasks & Assignments' }))
    await u.click(await screen.findByRole('button', { name: /Delete Read Chapter 5/ }))
    expect(screen.queryByText('Read Chapter 5 on work and energy')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('Read Chapter 5 on work and energy')).toBeInTheDocument()
  })

  it('imports Canvas deadlines from pasted .ics text, matches courses and skips repeats', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Tasks & Assignments' }))
    await u.click(await screen.findByRole('button', { name: 'Import from Canvas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Import from Canvas' })
    fireEvent.change(within(dialog).getByLabelText('Or paste the file text'), { target: { value: FEED } })
    expect(await within(dialog).findByText('Problem Set 4')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Course for Problem Set 4')).toHaveValue('c-fndstat')
    expect(within(dialog).getByLabelText('Course for Essay 2 draft')).toHaveValue('c-eng102')
    await u.click(within(dialog).getByRole('button', { name: 'Import 2 tasks' }))
    expect(await screen.findByText('Problem Set 4')).toBeInTheDocument()
    expect(screen.getByText('Imported 2 tasks.')).toBeInTheDocument()

    await u.click(screen.getByRole('button', { name: 'Import from Canvas' }))
    const again = await screen.findByRole('dialog', { name: 'Import from Canvas' })
    fireEvent.change(within(again).getByLabelText('Or paste the file text'), { target: { value: FEED } })
    expect(await within(again).findAllByText('Already imported')).toHaveLength(2)
    expect(within(again).getByRole('button', { name: 'Import' })).toBeDisabled()
  })
})

describe('Grades', () => {
  it('works out what is needed on the rest and updates when a score changes', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Grade & GPA Calculator' }))
    await u.click(await screen.findByRole('tab', { name: 'Course grades' }))
    await u.click(screen.getByRole('button', { name: 'FNDSTAT' }))
    const current = screen.getByRole('region', { name: 'Current grade' })
    expect(within(current).getByText('80.8%')).toBeInTheDocument()
    expect(within(current).getByRole('status')).toHaveTextContent(/average of 83\.2% on the remaining 50%/)

    const exam2 = screen.getByLabelText('Score for Long exam 2')
    await u.type(exam2, '90')
    expect(within(current).getByText(/84\.[23]%/)).toBeInTheDocument()
  })

  it('projects a what-if final grade from the sliders', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Grade & GPA Calculator' }))
    await u.click(await screen.findByRole('tab', { name: 'Course grades' }))
    await u.click(screen.getByRole('button', { name: 'FNDSTAT' }))
    const whatIf = screen.getByRole('region', { name: 'What-if' })
    fireEvent.change(within(whatIf).getByLabelText(/Long exam 2/), { target: { value: '100' } })
    fireEvent.change(within(whatIf).getByLabelText(/Final project/), { target: { value: '100' } })
    expect(within(whatIf).getByText('90.4%')).toBeInTheDocument()
  })

  it('projects a cumulative GPA and the term GPA needed for a target', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Grade & GPA Calculator' }))
    await u.type(await screen.findByLabelText('Previous CGPA'), '3.4')
    await u.type(screen.getByLabelText('Previous units'), '36')
    expect(within(screen.getByRole('region', { name: 'Cumulative GPA' })).getByText(/New CGPA/)).toBeInTheDocument()
    await u.type(screen.getByLabelText('Target CGPA'), '3.8')
    expect(screen.getByText(/Aim for a term GPA of|Out of reach/)).toBeInTheDocument()
  })
})

describe('Notes', () => {
  it('creates a note, previews markdown safely and links it to a class', async () => {
    const u = user()
    render(<App />)
    await u.click(screen.getByRole('link', { name: 'Notes' }))
    await u.click(await screen.findByRole('button', { name: 'New note' }))
    const editor = await screen.findByRole('region', { name: 'Note editor' })
    await u.type(within(editor).getByLabelText('Title'), 'Quiz prep')
    await u.selectOptions(within(editor).getByLabelText('Course'), 'c-cs101')
    await u.selectOptions(within(editor).getByLabelText('Linked class'), 's-cs101')
    expect(within(editor).getByLabelText('Class date')).not.toBeDisabled()
    fireEvent.change(within(editor).getByLabelText('Note body'), {
      target: { value: '# Trees\n\n- **BST** insert\n\n<script>alert(1)</script>' },
    })
    await u.click(within(editor).getByRole('tab', { name: 'Preview' }))
    expect(within(editor).getByRole('heading', { name: 'Trees' })).toBeInTheDocument()
    expect(within(editor).getByText('BST')).toBeInTheDocument()
    expect(within(editor).getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(editor.querySelector('script')).toBeNull()
  })

  it('starts a note for the class in session from the hero', async () => {
    vi.setSystemTime(new Date(2026, 9, 26, 10, 0)) // FNDSTAT is on
    const u = user()
    render(<App />)
    await u.click(await screen.findByRole('button', { name: 'Take notes' }))
    const editor = await screen.findByRole('region', { name: 'Note editor' })
    expect(within(editor).getByLabelText('Title')).toHaveValue('FNDSTAT, Oct 26')
    expect(within(editor).getByLabelText('Linked class')).toHaveValue('s-fndstat')
  })
})
