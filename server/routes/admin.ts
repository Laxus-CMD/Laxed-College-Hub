import { Router } from 'express'
import type { Db } from '../db.ts'
import { HttpError, requireRole } from '../http.ts'
import { deleteUserSessions } from '../sessions.ts'
import { audit, findUserById, publicUser, ROLE_IDS, SIGN_IN_COLUMNS, type UserRow } from '../users.ts'
import { fieldErrors, listUsersQuery, updateUserBody, userId } from '../validation.ts'

/** Everything here is admin-only. */
export function adminRoutes(db: Db): Router {
  const router = Router()
  router.use(requireRole('admin'))

  router.get('/users', async (req, res) => {
    const parsed = listUsersQuery.safeParse(req.query)
    if (!parsed.success) throw new HttpError(400, 'Bad query.', { fields: fieldErrors(parsed.error) })
    const { q, limit, offset } = parsed.data
    // Escape LIKE wildcards so a search for "_" or "%" matches literally.
    const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null
    const { rows } = await db.query<UserRow & { total: number }>(
      `SELECT u.id, u.email, u.name, r.name AS role, u.is_active, u.last_login_at, u.created_at, ${SIGN_IN_COLUMNS},
              count(*) OVER ()::int AS total
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE $1::text IS NULL OR u.email ILIKE $1 OR u.name ILIKE $1
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3`,
      [pattern, limit, offset],
    )
    res.json({ users: rows.map(publicUser), total: rows[0]?.total ?? 0 })
  })

  router.patch('/users/:id', async (req, res) => {
    const id = userId.safeParse(req.params.id)
    if (!id.success) throw new HttpError(404, 'Unknown user.')
    const body = updateUserBody.safeParse(req.body ?? {})
    if (!body.success) throw new HttpError(400, 'Check the highlighted fields.', { fields: fieldErrors(body.error) })

    const target = await findUserById(db, id.data)
    if (!target) throw new HttpError(404, 'Unknown user.')

    const demoting = body.data.role === 'user' || body.data.isActive === false
    if (demoting && target.id === req.user!.id) {
      throw new HttpError(400, 'You cannot remove your own admin access. Ask another admin.')
    }

    const updated = await db.tx(async (t) => {
      if (demoting) {
        // Two admins demoting each other at once must take turns, or both could succeed and leave none.
        // Same order as account deletion (by id), so the two can never wait on each other.
        const { rows: admins } = await t.query<{ id: string }>(
          'SELECT id FROM users WHERE role_id = $1 AND is_active ORDER BY id FOR UPDATE',
          [ROLE_IDS.admin],
        )
        // Read again now that we hold the lock: the target may have changed while we waited.
        const now = await findUserById(t, target.id)
        if (!now) throw new HttpError(404, 'Unknown user.')
        if (now.role === 'admin' && !admins.some((a) => a.id !== now.id)) {
          throw new HttpError(400, 'There must be at least one active admin.')
        }
      }
      await t.query(
        `UPDATE users SET role_id = COALESCE($2, role_id), is_active = COALESCE($3, is_active), updated_at = now()
          WHERE id = $1`,
        [target.id, body.data.role ? ROLE_IDS[body.data.role] : null, body.data.isActive ?? null],
      )
      // A role or status change takes effect at once: their open sessions end.
      await deleteUserSessions(t, target.id)
      await audit(t, { action: 'admin.user_updated', actorId: req.user!.id, targetId: target.id, detail: body.data, ip: req.ip })
      return (await findUserById(t, target.id))!
    })
    res.json({ user: publicUser(updated) })
  })

  router.get('/audit', async (_req, res) => {
    const { rows } = await db.query(
      `SELECT a.id::text, a.action, a.detail, a.ip, a.created_at AS "createdAt",
              actor.email AS "actorEmail", target.email AS "targetEmail"
         FROM audit_log a
         LEFT JOIN users actor ON actor.id = a.actor_id
         LEFT JOIN users target ON target.id = a.target_id
        ORDER BY a.created_at DESC
        LIMIT 100`,
    )
    res.json({ events: rows })
  })

  return router
}
