import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { Account } from '@/features/auth/api'
import { resetStores } from '@/test/seed'
import { useAuthStore } from '@/store/useAuthStore'
import { useTaskStore } from '@/store/useTaskStore'

const ADMIN: Account = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'admin@collegehub.test',
  name: 'Test Admin',
  role: 'admin',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  picture: null,
  hasPassword: true,
  hasGoogle: false,
}
const STUDENT: Account = { ...ADMIN, id: '00000000-0000-4000-8000-000000000002', email: 'student@collegehub.test', name: 'Test Student', role: 'user' }

type Handler = (body: unknown) => [number, unknown]

/** A fake API: maps "METHOD /path" to a handler. */
function mockApi(routes: Record<string, Handler>) {
  const calls: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`
      calls.push(key)
      const handler = routes[key]
      const [status, body] = handler ? handler(init?.body ? JSON.parse(String(init.body)) : undefined) : [404, { error: 'Not found.' }]
      return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }),
  )
  return calls
}

/** An account with nothing saved yet, which accepts every save. */
const emptyAccount = (account: Account): Record<string, Handler> => ({
  'GET /api/auth/me': () => [200, { user: account }],
  'GET /api/data': () => [
    200,
    {
      accountId: account.id,
      revision: 1,
      data: {
        revision: 1,
        profile: { name: 'Test', isDemo: false, bannerDismissed: false, scale: null, prior: { cgpa: null, units: null } },
        courses: [], sessions: [], tasks: [], notes: [], components: [],
      },
    },
  ],
  'POST /api/data/sync': () => [200, { revision: 2, data: null, noteCopies: {} }],
})

const options: Record<string, Handler> = { 'GET /api/auth/options': () => [200, { emailSignup: true, google: true }] }

beforeEach(() => {
  resetStores(new Date(2026, 9, 26, 8, 45))
  useAuthStore.setState({ account: null, guest: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('email accounts', () => {
  it('signs in an admin, who sees the Admin page', async () => {
    mockApi({
      ...options,
      'POST /api/auth/login': () => [200, { user: ADMIN }],
      ...emptyAccount(ADMIN),
      'GET /api/admin/users': () => [200, { users: [ADMIN, STUDENT], total: 2 }],
      'GET /api/admin/audit': () => [200, { events: [] }],
    })
    const u = userEvent.setup()
    render(<App />)
    const form = await screen.findByRole('form', { name: 'Sign in with email' })
    await u.type(within(form).getByLabelText('Email'), ADMIN.email)
    await u.type(within(form).getByLabelText('Password'), 'Admin-Test-2026!')
    await u.click(within(form).getByRole('button', { name: 'Sign in' }))

    await u.click(await screen.findByRole('link', { name: 'Admin' }))
    const accounts = await screen.findByRole('region', { name: 'Accounts' })
    expect(await within(accounts).findByRole('button', { name: `Disable ${STUDENT.email}` })).toBeInTheDocument()
    expect(within(accounts).getByLabelText(`Role for ${ADMIN.email}`)).toBeDisabled()
  })

  it('hides the Admin page from regular users, even by URL', async () => {
    mockApi({ ...options, ...emptyAccount(STUDENT) })
    useAuthStore.setState({ account: STUDENT })
    window.location.hash = 'admin'
    render(<App />)
    expect(await screen.findByRole('heading', { level: 1, name: /good (morning|afternoon|evening)/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('shows field errors from sign-up', async () => {
    mockApi({
      ...options,
      'POST /api/auth/signup': () => [400, { error: 'Check the highlighted fields.', fields: { password: 'Password must be at least 10 characters.' } }],
    })
    const u = userEvent.setup()
    render(<App />)
    await u.click(await screen.findByRole('tab', { name: 'Create account' }))
    const form = screen.getByRole('form', { name: 'Create an account' })
    await u.type(within(form).getByLabelText('Name'), 'Ana')
    await u.type(within(form).getByLabelText('Email'), 'ana@example.com')
    await u.type(within(form).getByLabelText('Password'), 'short')
    await u.click(within(form).getByRole('button', { name: 'Create account' }))
    expect(await within(form).findByText('Password must be at least 10 characters.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('signs out when the server says the session ended', async () => {
    mockApi({ ...options, 'GET /api/auth/me': () => [401, { error: 'Please sign in.' }], 'POST /api/auth/logout': () => [204, null] })
    useAuthStore.setState({ account: STUDENT })
    render(<App />)
    expect(await screen.findByRole('form', { name: 'Sign in with email' })).toBeInTheDocument()
  })

  it('says so when the accounts API is offline', async () => {
    mockApi({})
    render(<App />)
    expect(await screen.findByText(/Sign-in is offline/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue without an account' })).toBeInTheDocument()
  })

  it('hides account creation when the server has email sign-up off', async () => {
    mockApi({ 'GET /api/auth/options': () => [200, { emailSignup: false, google: true }] })
    render(<App />)
    const form = await screen.findByRole('form', { name: 'Sign in with email' })
    expect(within(form).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('drops a Google profile saved by an older version, so the server can check it', async () => {
    const saved = { state: { user: { id: '1', name: 'Old', email: 'old@gmail.com' }, account: null, guest: false }, version: 1 }
    localStorage.setItem('college-hub.auth', JSON.stringify(saved))
    await useAuthStore.persist.rehydrate()
    expect(useAuthStore.getState()).toMatchObject({ account: null, guest: false })
    expect(localStorage.getItem('college-hub.auth')).not.toContain('old@gmail.com')
  })

  it('deletes a Google account after the email is typed', async () => {
    const google = { ...STUDENT, hasPassword: false, hasGoogle: true }
    let sent: unknown
    const calls = mockApi({
      ...options,
      ...emptyAccount(google),
      'POST /api/auth/delete': (body) => {
        sent = body
        return [204, null]
      },
    })
    useAuthStore.setState({ account: google })
    const u = userEvent.setup()
    render(<App />)
    await u.click((await screen.findAllByRole('button', { name: 'Your data' }))[0]!)
    expect(screen.queryByRole('button', { name: 'Password' })).not.toBeInTheDocument()
    await u.click(await screen.findByRole('button', { name: 'Delete account' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete account' })
    await u.type(within(dialog).getByLabelText(/Type student@collegehub.test/), google.email)
    await u.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    expect(await screen.findByRole('button', { name: 'Continue without an account' })).toBeInTheDocument()
    expect(sent).toEqual({ email: google.email })
    expect(calls).not.toContain('POST /api/auth/logout')
  })
})

describe('data in the account', () => {
  const signedIn = (routes: Record<string, Handler> = {}) => {
    const calls = mockApi({ ...options, ...emptyAccount(STUDENT), 'POST /api/auth/logout': () => [204, null], ...routes })
    useAuthStore.setState({ account: STUDENT, guest: false })
    render(<App />)
    return calls
  }
  const openSettings = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.click((await screen.findAllByRole('button', { name: 'Your data' }))[0]!)
    return screen.findByRole('dialog', { name: 'Your data' })
  }

  it('waits for the account\'s data before showing anything', async () => {
    signedIn()
    expect(screen.getByRole('status')).toHaveTextContent('Loading your data')
    expect(screen.queryByText(/Binary Search Tree/)).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: /good .*, Test/i })).toBeInTheDocument()
    expect(screen.queryByText(/Binary Search Tree/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0)
  })

  it('offers to try again when the data cannot load', async () => {
    let fail = true
    const ok = emptyAccount(STUDENT)['GET /api/data']!
    signedIn({ 'GET /api/data': (b) => (fail ? [503, { error: 'College Hub is temporarily unavailable.' }] : ok(b)) })
    expect(await screen.findByRole('heading', { name: 'Could not load your data' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('temporarily unavailable')
    fail = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('navigation', { name: 'Main menu' })).toBeInTheDocument()
  })

  it('warns when a save fails, and saves with Try now', async () => {
    let fail = true
    signedIn({ 'POST /api/data/sync': () => (fail ? [500, { error: 'x' }] : [200, { revision: 2, data: null, noteCopies: {} }]) })
    const u = userEvent.setup()
    await screen.findByRole('navigation', { name: 'Main menu' })
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Read chapter 6' })
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(/not saved yet. Keep this page open/)
    fail = false
    await u.click(screen.getByRole('button', { name: 'Try now' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getAllByText('Saved').length).toBeGreaterThan(0)
  })

  it('saves before signing out, then takes the data out of the app', async () => {
    const calls = signedIn()
    const u = userEvent.setup()
    await screen.findByRole('navigation', { name: 'Main menu' })
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Last task' })
    const dialog = await openSettings(u)
    expect(within(dialog).getByText(STUDENT.email)).toBeInTheDocument()
    await u.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Continue without an account' })).toBeInTheDocument()
    expect(calls.indexOf('POST /api/data/sync')).toBeGreaterThan(-1)
    expect(calls.indexOf('POST /api/data/sync')).toBeLessThan(calls.indexOf('POST /api/auth/logout'))
    expect(useTaskStore.getState().tasks.some((t) => t.title === 'Last task')).toBe(false)
  })

  it('asks before signing out with changes that could not be saved', async () => {
    const calls = signedIn({ 'POST /api/data/sync': () => [500, { error: 'x' }] })
    const u = userEvent.setup()
    await screen.findByRole('navigation', { name: 'Main menu' })
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Last task' })
    const dialog = await openSettings(u)
    await u.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('they are lost')
    expect(calls).not.toContain('POST /api/auth/logout')
    await u.click(within(dialog).getByRole('button', { name: 'Sign out anyway' }))
    expect(await screen.findByRole('button', { name: 'Continue without an account' })).toBeInTheDocument()
    expect(screen.queryByText(/signed out before everything was saved/)).not.toBeInTheDocument()
  })

  it('asks to sign in again when the session ends with unsaved changes', async () => {
    signedIn({ 'POST /api/data/sync': () => [401, { error: 'Please sign in.' }] })
    await screen.findByRole('navigation', { name: 'Main menu' })
    useTaskStore.getState().addTask({ kind: 'todo', title: 'Last task' })
    expect(await screen.findByRole('alert', {}, { timeout: 4000 })).toHaveTextContent(`sign in as ${STUDENT.email}`)
  })

  it('tells guests where their data is', async () => {
    mockApi(options)
    useAuthStore.setState({ account: null, guest: true })
    render(<App />)
    expect(screen.getAllByText('Not backed up').length).toBeGreaterThan(0)
    const dialog = await openSettings(userEvent.setup())
    expect(dialog).toHaveTextContent(/Saved only in this browser/)
  })
})
