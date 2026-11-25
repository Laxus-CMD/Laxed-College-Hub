import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FEATURES, KEEP_IF_MISSING as SERVER_KEEP, TASK_MODES as SERVER_MODES } from '../server/dataSchema.ts'
import { KEEP_IF_MISSING as CLIENT_KEEP } from '@/sync/doc'
import { API_FEATURES, TASK_MODES } from '@/types'

// The app and the API are deployed separately, so lists they both hold must agree.
describe('the app and the API agree', () => {
  it('on what the API reports it can store', () => {
    expect([...FEATURES]).toEqual([...API_FEATURES])
  })

  it('on the workspace modes', () => {
    expect([...SERVER_MODES]).toEqual([...TASK_MODES])
    // And the database agrees: the CHECK in the migration that added the column.
    const sql = readFileSync('server/migrations/008_profile_task_mode.sql', 'utf8')
    const listed = [...(sql.match(/task_mode IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
    expect(listed).toEqual([...TASK_MODES])
  })

  it('on the fields an older app leaves out, which keep what is saved', () => {
    const server = Object.fromEntries(Object.entries(SERVER_KEEP).map(([kind, pairs]) => [kind, pairs.map(([field]) => field)]))
    expect(server).toEqual(CLIENT_KEEP)
  })
})
