import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/**
 * Password hashing with scrypt (memory-hard, built into Node, no native addon).
 * Stored as `scrypt$N$r$p$salt$hash` so the cost can be raised later:
 * needsRehash() spots old hashes and login upgrades them.
 */

export interface ScryptParams {
  N: number
  r: number
  p: number
}

const KEY_LEN = 64
const SALT_LEN = 16

function derive(password: string, salt: Buffer, { N, r, p }: ScryptParams): Promise<Buffer> {
  // scrypt needs about 128 * N * r bytes. Allow double that.
  const options: ScryptOptions = { N, r, p, maxmem: 256 * N * r }
  return new Promise((resolve, reject) => {
    // NFKC so the same password typed on different keyboards hashes the same.
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, options, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPassword(password: string, params: ScryptParams): Promise<string> {
  const salt = randomBytes(SALT_LEN)
  const key = await derive(password, salt, params)
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

function parse(stored: string): { params: ScryptParams; salt: Buffer; key: Buffer } | null {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const [N, r, p] = parts.slice(1, 4).map(Number) as [number, number, number]
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null
  return { params: { N, r, p }, salt: Buffer.from(parts[4]!, 'base64url'), key: Buffer.from(parts[5]!, 'base64url') }
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parse(stored)
  if (!parsed) return false
  const key = await derive(password, parsed.salt, parsed.params)
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key)
}

export function needsRehash(stored: string, params: ScryptParams): boolean {
  const parsed = parse(stored)
  return !parsed || parsed.params.N < params.N || parsed.params.r !== params.r || parsed.params.p !== params.p
}

/**
 * A hash of a random password, for comparing against when the email is unknown.
 * That way "no such user" takes as long as "wrong password".
 */
let dummy: Promise<string> | null = null
export function dummyHash(params: ScryptParams): Promise<string> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'), params)
  return dummy
}
