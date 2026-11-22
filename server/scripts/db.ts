/**
 * Database chores. Run with npm:
 *   npm run db:migrate                 apply pending migrations
 *   npm run db:seed                    create the test accounts (refused in production)
 *   npm run db:create-admin            create or promote an admin from ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD
 *
 * Stop the dev API first when using the local PGlite database: it allows one process at a time.
 */
import { loadConfig } from '../config.ts'
import { connectDb } from '../db.ts'
import { migrate } from '../migrate.ts'
import { hashPassword } from '../password.ts'
import { seedTestAccounts, TEST_ACCOUNTS } from '../seed.ts'
import { audit, findUserByEmail, insertUser, ROLE_IDS } from '../users.ts'
import { email as emailRule, name as nameRule, password as passwordRule } from '../validation.ts'

const command = process.argv[2]
const config = loadConfig({ ...process.env, SEED_TEST_ACCOUNTS: 'false' })
const db = await connectDb(config.DATABASE_URL!, { poolMax: 2 })
const scrypt = { N: config.SCRYPT_N, r: 8, p: 1 }

try {
  await migrate(db, console.log)

  if (command === 'migrate') {
    console.log('Migrations are up to date.')
  } else if (command === 'seed') {
    if (config.isProduction) throw new Error('Refusing to seed test accounts in production.')
    await seedTestAccounts(db, scrypt, console.log)
    console.table(TEST_ACCOUNTS.map(({ email, password, role }) => ({ email, password, role })))
  } else if (command === 'create-admin') {
    const email = emailRule.parse(process.env.ADMIN_EMAIL)
    const name = nameRule.parse(process.env.ADMIN_NAME ?? 'Admin')
    const existing = await findUserByEmail(db, email)
    if (existing) {
      await db.query('UPDATE users SET role_id = $2, is_active = true, updated_at = now() WHERE id = $1', [existing.id, ROLE_IDS.admin])
      await audit(db, { action: 'cli.promote_admin', targetId: existing.id })
      console.log(`${email} is now an admin.`)
    } else {
      const password = passwordRule.parse(process.env.ADMIN_PASSWORD)
      const user = await insertUser(db, { email, name, role: 'admin', passwordHash: await hashPassword(password, scrypt) })
      await audit(db, { action: 'cli.create_admin', targetId: user!.id })
      console.log(`Created admin ${email}.`)
    }
  } else {
    throw new Error('Usage: node server/scripts/db.ts <migrate|seed|create-admin>')
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  await db.close()
}
