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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'same-origin',
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
  /** True when the API is up. Used to show or hide email sign-in. */
  health: () =>
    request<{ ok: boolean }>('GET', '/health').then(
      (r) => r.ok,
      () => false,
    ),
  signup: (body: { name: string; email: string; password: string }) =>
    request<{ user: Account }>('POST', '/auth/signup', body).then((r) => r.user),
  login: (body: { email: string; password: string }) => request<{ user: Account }>('POST', '/auth/login', body).then((r) => r.user),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<{ user: Account }>('GET', '/auth/me').then((r) => r.user),
  changePassword: (body: { currentPassword: string; newPassword: string }) => request<void>('POST', '/auth/password', body),
  listUsers: (q = '') =>
    request<{ users: Account[]; total: number }>('GET', `/admin/users?${new URLSearchParams(q ? { q } : {})}`),
  updateUser: (id: string, body: { role?: Role; isActive?: boolean }) =>
    request<{ user: Account }>('PATCH', `/admin/users/${encodeURIComponent(id)}`, body).then((r) => r.user),
  audit: () => request<{ events: AuditEvent[] }>('GET', '/admin/audit').then((r) => r.events),
}
