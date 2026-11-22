import type { Db } from './db.ts'
import { hashPassword, type ScryptParams } from './password.ts'
import type { Role } from './sessions.ts'
import { audit, findUserByEmail, insertUser } from './users.ts'

/**
 * Test accounts for local development and staging. They use the reserved
 * `.test` domain, so they can never belong to a real person. The server
 * refuses to seed them in production (see config.ts).
 */
export const TEST_ACCOUNTS: { email: string; name: string; password: string; role: Role }[] = [
  { email: 'admin@collegehub.test', name: 'Test Admin', password: 'Admin-Test-2026!', role: 'admin' },
  { email: 'student@collegehub.test', name: 'Test Student', password: 'Student-Test-2026!', role: 'user' },
]

/** Creates any missing test accounts. Existing accounts are left alone. */
export async function seedTestAccounts(db: Db, params: ScryptParams, log: (msg: string) => void = () => {}): Promise<void> {
  for (const account of TEST_ACCOUNTS) {
    if (await findUserByEmail(db, account.email)) continue
    const user = await insertUser(db, {
      email: account.email,
      name: account.name,
      role: account.role,
      passwordHash: await hashPassword(account.password, params),
    })
    if (user) {
      await audit(db, { action: 'seed.test_account', targetId: user.id, detail: { role: account.role } })
      log(`Seeded test ${account.role}: ${account.email}`)
    }
  }
}
