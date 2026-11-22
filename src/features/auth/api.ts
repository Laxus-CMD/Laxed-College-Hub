/**
 * Client for the College Hub accounts API (server/). Requests go to the same
 * origin, so the HttpOnly session cookie is sent automatically and stays
 * first-party. In dev, Vite proxies /api to the API; in production, Vercel does.
 */

export type Role = 'admin' | 'user'

export interface Account {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  picture: string | null
  hasPassword: boolean
  hasGoogle: boolean
}

/** Which ways to sign in the server offers. */
export interface SignInOptions {
  emailSignup: boolean
  google: boolean
}

export interface AuditEvent {
  id: string
  action: string
  actorEmail: string | null
  targetEmail: string | null
  ip: string | null
  createdAt: string
}

export const API_BASE: string = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export async function request<T>(method: string, path: string, body?: unknown, { keepalive = false } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
      // Lets a save finish while the page is closing.
      keepalive,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the College Hub server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  const data = (await res.json().catch(() => null)) as { error?: string; fields?: Record<string, string> } | null
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Please try again.', data?.fields)
  return data as T
}

export const accountsApi = {
  /** Null when the server cannot be reached (or this site has none, like the GitHub Pages mirror). */
  options: () => request<SignInOptions>('GET', '/auth/options').catch(() => null),
  /** `credential` is the ID token from Google. The server checks it. */
  google: (credential: string) => request<{ user: Account; passwordRemoved: boolean }>('POST', '/auth/google', { credential }),
  deleteAccount: (body: { password: string } | { email: string }) => request<void>('POST', '/auth/delete', body),
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ user: Account }>('POST', '/auth/signup', body).then((r) => r.user),
  login: (body: { email: string; password: string }) => request<{ user: Account }>('POST', '/auth/login', body).then((r) => r.user),
  logout: () => request<void>('POST', '/auth/logout'),
  logoutAll: () => request<void>('POST', '/auth/logout-all'),
  me: () => request<{ user: Account }>('GET', '/auth/me').then((r) => r.user),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<void>('POST', '/auth/password', body),
  listUsers: (q = '') =>
    request<{ users: Account[]; total: number }>('GET', `/admin/users?${new URLSearchParams(q ? { q } : {})}`),
  updateUser: (id: string, body: { role?: Role; isActive?: boolean }) =>
    request<{ user: Account }>('PATCH', `/admin/users/${encodeURIComponent(id)}`, body).then((r) => r.user),
  audit: () => request<{ events: AuditEvent[] }>('GET', '/admin/audit').then((r) => r.events),
}
