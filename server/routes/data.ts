import express, { Router } from 'express'
import { loadQuery, saveBody } from '../dataSchema.ts'
import type { Db } from '../db.ts'
import { HttpError, parse, requireAuth } from '../http.ts'
import { RateLimiter } from '../rateLimit.ts'
import { currentRevision, loadData, saveData } from '../studentData.ts'

export interface DataLimits {
  /** Saves per student per minute. The app waits between saves, so this is many open tabs. */
  savesPerMinute: number
  loadsPerMinute: number
}

export const DEFAULT_DATA_LIMITS: DataLimits = { savesPerMinute: 120, loadsPerMinute: 120 }

/** The signed-in student's own data. Nobody else's is reachable: whose data it is only ever comes from the session. */
export function dataRoutes(db: Db, limits: DataLimits = DEFAULT_DATA_LIMITS): Router {
  const router = Router()
  const saves = new RateLimiter(db, 'data-save', limits.savesPerMinute, 60)
  const loads = new RateLimiter(db, 'data-load', limits.loadsPerMinute, 60)

  const limit = async (limiter: RateLimiter, userId: string) => {
    const wait = await limiter.hit(userId)
    if (wait) throw new HttpError(429, 'Saving too often. Trying again shortly.', { retryAfter: wait })
  }

  router.use(requireAuth)

  /** Everything. With ?since=N, only when the account has changed since revision N. */
  router.get('/', async (req, res) => {
    const userId = req.user!.id
    await limit(loads, userId)
    const { since } = parse(loadQuery, req.query)
    if (since !== undefined && since === (await currentRevision(db, userId))) {
      res.json({ accountId: userId, revision: since, data: null })
      return
    }
    const data = await loadData(db, userId)
    res.json({ accountId: userId, revision: data.revision, data })
  })

  // The big body limit comes after the sign-in and rate checks, so strangers cannot use it.
  router.post(
    '/sync',
    async (req, _res, next) => {
      await limit(saves, req.user!.id)
      next()
    },
    express.json({ limit: '4mb' }),
    async (req, res) => {
      const body = parse(saveBody, req.body)
      if (body.accountId !== req.user!.id) throw new HttpError(409, 'You are signed in to another account in this browser.')
      res.json(await saveData(db, req.user!.id, body))
    },
  )

  return router
}
