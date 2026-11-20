import { describe, expect, it } from 'vitest'
import { parseGoogleCredential } from './google'

const CLIENT = 'abc.apps.googleusercontent.com'
const NOW = Date.UTC(2026, 10, 21, 8, 0)

function b64url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function token(claims: Record<string, unknown>): string {
  return `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claims)}.signature`
}

const VALID = {
  iss: 'https://accounts.google.com',
  aud: CLIENT,
  sub: '1234567890',
  email: 'juan@dlsu.edu.ph',
  name: 'Juan Dela Cruz',
  given_name: 'Juan',
  picture: 'https://lh3.googleusercontent.com/a/photo',
  exp: NOW / 1000 + 3600,
}

describe('parseGoogleCredential', () => {
  it('reads the profile from a valid token', () => {
    expect(parseGoogleCredential(token(VALID), CLIENT, NOW)).toEqual({
      id: '1234567890',
      email: 'juan@dlsu.edu.ph',
      name: 'Juan Dela Cruz',
      givenName: 'Juan',
      picture: 'https://lh3.googleusercontent.com/a/photo',
    })
  })

  it('handles names outside ASCII', () => {
    const user = parseGoogleCredential(token({ ...VALID, name: 'Niño Peña', given_name: 'Niño' }), CLIENT, NOW)
    expect(user?.name).toBe('Niño Peña')
  })

  it('falls back to the email when there is no name', () => {
    const { name: _n, given_name: _g, ...rest } = VALID
    const user = parseGoogleCredential(token(rest), CLIENT, NOW)
    expect(user?.name).toBe('juan@dlsu.edu.ph')
    expect(user?.givenName).toBe('juan@dlsu.edu.ph')
  })

  it('rejects tokens for another app, from another issuer, or expired', () => {
    expect(parseGoogleCredential(token({ ...VALID, aud: 'other' }), CLIENT, NOW)).toBeNull()
    expect(parseGoogleCredential(token({ ...VALID, iss: 'evil.example' }), CLIENT, NOW)).toBeNull()
    expect(parseGoogleCredential(token({ ...VALID, exp: NOW / 1000 - 1 }), CLIENT, NOW)).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(parseGoogleCredential('not-a-jwt', CLIENT, NOW)).toBeNull()
    expect(parseGoogleCredential('a.!!!.c', CLIENT, NOW)).toBeNull()
    expect(parseGoogleCredential(token({ ...VALID, sub: undefined }), CLIENT, NOW)).toBeNull()
  })
})
