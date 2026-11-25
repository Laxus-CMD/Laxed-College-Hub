import { describe, expect, it } from 'vitest'
import { KEEP_IF_MISSING as SERVER_KEEP, TASK_MODES as SERVER_MODES } from '../server/dataSchema.ts'
import { KEEP_IF_MISSING as CLIENT_KEEP } from '@/sync/doc'
import { TASK_MODES } from '@/types'

// The app and the API are deployed separately, so lists they both hold must agree.
describe('the app and the API agree', () => {
  it('on the workspace modes', () => {
    expect([...SERVER_MODES]).toEqual([...TASK_MODES])
  })

  it('on the fields an older app leaves out, which keep what is saved', () => {
    const server = Object.fromEntries(Object.entries(SERVER_KEEP).map(([kind, pairs]) => [kind, pairs.map(([field]) => field)]))
    expect(server).toEqual(CLIENT_KEEP)
  })
})
