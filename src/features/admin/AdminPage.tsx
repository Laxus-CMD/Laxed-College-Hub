import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, EmptyNote } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Chip'
import { Input, Select } from '@/components/ui/Field'
import { PageHeader } from '@/components/ui/PageHeader'
import { accountsApi, ApiError, type Account, type AuditEvent, type Role } from '@/features/auth/api'
import { useAuthStore } from '@/store/useAuthStore'
import { useUiStore } from '@/store/useUiStore'

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never'

const ACTIONS: Record<string, string> = {
  'user.signup': 'Signed up',
  'login.success': 'Signed in',
  'login.failed': 'Failed sign-in',
  'user.password_changed': 'Changed password',
  'admin.user_updated': 'Account updated by admin',
  'seed.test_account': 'Test account created',
  'cli.create_admin': 'Admin created from the command line',
  'cli.promote_admin': 'Promoted from the command line',
}

/** User management for admins. Every action is checked again by the API. */
export default function AdminPage() {
  const me = useAuthStore((s) => s.account)
  const showToast = useUiStore((s) => s.showToast)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<Account[] | null>(null)
  const [total, setTotal] = useState(0)
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const onApiError = useCallback((err: unknown) => {
    // A 401 means the session ended (expired, or this account's role changed).
    if (err instanceof ApiError && err.status === 401) useAuthStore.getState().signOut()
    setError(err instanceof Error ? err.message : 'Something went wrong.')
  }, [])

  const load = useCallback(
    async (q: string) => {
      try {
        const [list, audit] = await Promise.all([accountsApi.listUsers(q), accountsApi.audit()])
        setUsers(list.users)
        setTotal(list.total)
        setEvents(audit)
        setError(null)
      } catch (err) {
        onApiError(err)
      }
    },
    [onApiError],
  )

  useEffect(() => {
    const t = setTimeout(() => load(query), query ? 250 : 0)
    return () => clearTimeout(t)
  }, [query, load])

  const update = async (user: Account, change: { role?: Role; isActive?: boolean }) => {
    try {
      const updated = await accountsApi.updateUser(user.id, change)
      setUsers((list) => list?.map((u) => (u.id === updated.id ? updated : u)) ?? null)
      showToast({ message: `Updated ${updated.email}. They will need to sign in again.` })
      accountsApi.audit().then(setEvents, () => {})
    } catch (err) {
      onApiError(err)
    }
  }

  return (
    <>
      <PageHeader title="Admin" subtitle="Manage College Hub accounts and roles." />
      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-bad/10 px-3.5 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card aria-label="Accounts">
          <CardHeader
            title="Accounts"
            meta={users ? `${total} total` : undefined}
            actions={
              <Input
                type="search"
                aria-label="Search accounts"
                placeholder="Search name or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-56"
              />
            }
          />
          {users === null ? (
            <EmptyNote>Loading accounts…</EmptyNote>
          ) : users.length === 0 ? (
            <EmptyNote>No accounts match.</EmptyNote>
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-[13.5px]">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-2 py-2 font-medium">Name</th>
                    <th className="px-2 py-2 font-medium">Role</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Last sign-in</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === me?.id
                    return (
                      <tr key={u.id} className="border-t border-line">
                        <td className="px-2 py-2.5">
                          <span className="block font-medium">
                            {u.name}
                            {self ? <span className="font-normal text-muted"> (you)</span> : null}
                          </span>
                          <span className="block text-[12.5px] text-muted">{u.email}</span>
                        </td>
                        <td className="px-2 py-2.5">
                          <Select
                            aria-label={`Role for ${u.email}`}
                            value={u.role}
                            disabled={self}
                            onChange={(e) => update(u, { role: e.target.value as Role })}
                            className="h-8 w-28"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </Select>
                        </td>
                        <td className="px-2 py-2.5">
                          <Pill tone={u.isActive ? 'good' : 'bad'}>{u.isActive ? 'Active' : 'Disabled'}</Pill>
                        </td>
                        <td className="px-2 py-2.5 text-muted tabular-nums">{when(u.lastLoginAt)}</td>
                        <td className="px-2 py-2.5 text-right">
                          {self ? null : (
                            <Button
                              size="sm"
                              variant={u.isActive ? 'danger' : 'ghost'}
                              aria-label={`${u.isActive ? 'Disable' : 'Enable'} ${u.email}`}
                              onClick={() => update(u, { isActive: !u.isActive })}
                            >
                              {u.isActive ? 'Disable' : 'Enable'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card aria-label="Recent activity">
          <CardHeader title="Recent activity" />
          {events.length === 0 ? (
            <EmptyNote>Nothing yet.</EmptyNote>
          ) : (
            <ul className="flex flex-col gap-2.5 text-[13px]">
              {events.slice(0, 30).map((e) => (
                <li key={e.id} className="flex flex-col">
                  <span className="font-medium">{ACTIONS[e.action] ?? e.action}</span>
                  <span className="truncate text-muted">
                    {e.targetEmail ?? e.actorEmail ?? 'Unknown'}
                    {e.actorEmail && e.targetEmail && e.actorEmail !== e.targetEmail ? ` by ${e.actorEmail}` : ''} · {when(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
