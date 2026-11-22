import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

export interface Queryable {
  /** One parameterized statement. Always pass values as params, never by string concatenation. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  /** Several statements with no params (migrations). */
  exec(sql: string): Promise<void>
}

/** The small slice of a Postgres client the server needs. Backed by node-postgres or PGlite. */
export interface Db extends Queryable {
  /** Runs `fn` in one transaction. Commits when it resolves and rolls back when it throws. */
  tx<T>(fn: (t: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface DbOptions {
  poolMax?: number
  /** Close idle connections after this long. Short on serverless, where an instance can be frozen at any time. */
  idleTimeoutMs?: number
  /** Called when an idle connection drops, for example when the database restarts or suspends. */
  onIdleError?: (err: Error) => void
}

export async function connectDb(
  url: string,
  { poolMax = 10, idleTimeoutMs = 30_000, onIdleError = () => {} }: DbOptions = {},
): Promise<Db> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url, max: poolMax, idleTimeoutMillis: idleTimeoutMs, connectionTimeoutMillis: 10_000 })
    // Without a listener, a dropped idle connection would crash the process. The pool replaces it by itself.
    pool.on('error', onIdleError)
    try {
      // Surface a broken connection at startup rather than on the first request.
      await pool.query('SELECT 1')
    } catch (err) {
      await pool.end().catch(() => {})
      throw err
    }
    return {
      query: async (sql, params) => pool.query(sql, params) as never,
      exec: async (sql) => {
        await pool.query(sql)
      },
      tx: async (fn) => {
        const client = await pool.connect()
        let broken: Error | undefined
        try {
          await client.query('BEGIN')
          const result = await fn({
            query: async (sql, params) => client.query(sql, params) as never,
            exec: async (sql) => {
              await client.query(sql)
            },
          })
          await client.query('COMMIT')
          return result
        } catch (err) {
          await client.query('ROLLBACK').catch((e: Error) => {
            broken = e
          })
          throw err
        } finally {
          // A client that could not roll back is destroyed, never reused.
          client.release(broken)
        }
      },
      close: () => pool.end(),
    }
  }

  // Embedded Postgres (WASM) for local development and tests. Single process only.
  const { PGlite } = await import('@electric-sql/pglite')
  // PGlite creates its own folder but not the parents.
  if (url !== 'memory://') await mkdir(path.dirname(path.resolve(url)), { recursive: true })
  const lite = url === 'memory://' ? new PGlite() : new PGlite(url)
  await lite.waitReady
  return {
    query: async (sql, params) => lite.query(sql, params) as never,
    exec: async (sql) => {
      await lite.exec(sql)
    },
    tx: (fn) =>
      lite.transaction((t) =>
        fn({
          query: async (sql, params) => t.query(sql, params) as never,
          exec: async (sql) => {
            await t.exec(sql)
          },
        }),
      ) as never,
    close: () => lite.close(),
  }
}
