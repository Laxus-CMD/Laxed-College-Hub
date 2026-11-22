import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '@/app/App'
import type { Account } from '@/features/auth/api'
import { resetStores } from '@/test/seed'
import { useAuthStore } from '@/store/useAuthStore'

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
      'GET /api/auth/me': () => [200, { user: ADMIN }],
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
    mockApi({ ...options, 'GET /api/auth/me': () => [200, { user: STUDENT }] })
    useAuthStore.setState({ account: STUDENT })
    window.location.hash = 'admin'
    render(<App />)
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: /good morning/i })).toBeInTheDocument()
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
      'GET /api/auth/me': () => [200, { user: google }],
      'POST /api/auth/delete': (body) => {
        sent = body
        return [204, null]
      },
    })
    useAuthStore.setState({ account: google })
    const u = userEvent.setup()
    render(<App />)
    await u.click(screen.getAllByRole('button', { name: 'Your data' })[0]!)
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
