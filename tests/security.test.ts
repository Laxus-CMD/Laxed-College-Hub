// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkBundle, findSecrets } from '../scripts/secrets.ts'
import { contentSecurityPolicy, inlineScriptHashes, siteHeaders } from '../scripts/siteHeaders.ts'

// Put together here, so this file does not look like it holds secrets itself.
const FAKE = {
  database: ['postgresql://owner', 'npg', 'Zx81kLmQ0pRt'].join(':').replace('npg:', 'npg_') + '@ep-cool-1.neon.tech/db',
  googleKey: 'AI' + 'za' + 'b'.repeat(35),
  googleSecret: 'GOC' + 'SPX-' + 'c'.repeat(24),
  github: 'gh' + 'p_' + 'd'.repeat(36),
  aws: 'AK' + 'IA' + 'E'.repeat(16),
  anthropic: 'sk-' + 'ant-' + 'f'.repeat(24),
  privateKey: '-----BEGIN ' + 'PRIVATE KEY-----',
  jwt: ['ey' + 'J' + 'g'.repeat(20), 'ey' + 'J' + 'h'.repeat(20), 'i'.repeat(20)].join('.'),
}

describe('this public repository', () => {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n')

  it('has no secrets in any file', () => {
    const found: string[] = []
    for (const file of files) {
      let text: string
      try {
        text = readFileSync(file, 'utf8')
      } catch {
        continue // deleted, but not committed yet
      }
      for (const secret of findSecrets(text)) found.push(`${file}: ${secret}`)
    }
    expect(found).toEqual([])
  })

  it('has no private files', () => {
    expect(files.filter((f) => /(?:^|\/)\.env(?!\.example$|\.server\.example$)|\.(?:pem|key|dump|gpg|local)$/.test(f))).toEqual([])
  })

  it('keeps server code out of the browser app', () => {
    const imports = files
      .filter((f) => /^src\/.*\.tsx?$/.test(f) && !f.includes('.test.'))
      .filter((f) => /from\s+['"][^'"]*(?:server|scripts)\/|process\.env/.test(readFileSync(f, 'utf8')))
    expect(imports).toEqual([])
  })
})

describe('finding secrets', () => {
  it.each(Object.entries(FAKE))('recognizes a %s', (_name, secret) => {
    const found = findSecrets(`first line\nconst x = "${secret}"`)
    expect(found.length).toBeGreaterThan(0)
    // Says where, never what.
    expect(found.join()).toContain('line 2')
    expect(found.join()).not.toContain(secret)
  })

  it('allows placeholders and public values', () => {
    expect(findSecrets('postgres://app_user:<password>@db.example.com:5432/x')).toEqual([])
    expect(findSecrets('postgres://college_hub_app:…@host:5432/college_hub')).toEqual([])
    expect(findSecrets('postgres://postgres:dev@localhost:5432/postgres')).toEqual([])
    expect(findSecrets('123456789-abcdefghijklmnop.apps.googleusercontent.com')).toEqual([])
  })
})

describe('checking the built site', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'hub-'))
    writeFileSync(path.join(dir, 'index.html'), '<p>hello</p>')
  })
  afterEach(() => rmSync(dir, { recursive: true }))

  it('passes a clean site', () => {
    expect(checkBundle(dir, { VITE_GOOGLE_CLIENT_ID: 'public', DATABASE_URL: FAKE.database })).toEqual([])
  })

  it('refuses a secret in a file', () => {
    writeFileSync(path.join(dir, 'app.js'), `x="${FAKE.googleSecret}"`)
    expect(checkBundle(dir)).toEqual(['app.js contains a Google client secret (line 1).'])
  })

  it('refuses the value of a private setting, whatever it looks like', () => {
    writeFileSync(path.join(dir, 'app.js'), 'x="plain-looking-value"')
    expect(checkBundle(dir, { BACKUP_PASSPHRASE: 'plain-looking-value' })).toEqual(['app.js contains the value of BACKUP_PASSPHRASE.'])
    // The password alone, without the rest of the address.
    expect(checkBundle(dir, { DATABASE_URL: 'postgres://u:plain-looking-value@h.example/db' })).toEqual(['app.js contains the value of DATABASE_URL.'])
  })

  it('refuses an unknown VITE_ setting', () => {
    expect(checkBundle(dir, { VITE_DATABASE_URL: 'x' }).join()).toMatch(/VITE_DATABASE_URL would be readable/)
    expect(checkBundle(dir, { VITE_VERCEL_ENV: 'production' })).toEqual([])
  })

  it('refuses source maps and private files', () => {
    for (const name of ['app.js.map', '.env.local', 'backup.dump']) writeFileSync(path.join(dir, name), '')
    expect(checkBundle(dir).sort()).toEqual([
      '.env.local must not be published.',
      'app.js.map is a source map.',
      'backup.dump must not be published.',
    ])
  })
})

describe('site headers', () => {
  it('only allows scripts from the site, Google sign-in, and the exact inline scripts', () => {
    const directives = new Map(
      contentSecurityPolicy(["'sha256-abc'"]).split('; ').map((d): [string, string[]] => [d.split(' ')[0]!, d.split(' ').slice(1)]),
    )
    expect(directives.get('default-src')).toEqual(["'none'"])
    expect(directives.get('script-src')).toEqual(["'self'", 'https://accounts.google.com/gsi/client', "'sha256-abc'"])
    expect(directives.get('connect-src')).toEqual(["'self'", 'https://accounts.google.com/gsi/'])
    expect(directives.get('frame-ancestors')).toEqual(["'none'"])
    expect(directives.get('form-action')).toEqual(["'self'"])
  })

  it('hashes inline scripts the way browsers do', () => {
    // From the CSP specification: sha256 of "alert('Hello, world.');"
    const known = "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='"
    expect(inlineScriptHashes("<script>alert('Hello, world.');</script>")).toEqual([known])
    expect(inlineScriptHashes('<script>a\r\nb</script>')).toEqual(inlineScriptHashes('<script>a\nb</script>'))
    // Files from the site are covered by 'self'.
    expect(inlineScriptHashes('<script type="module" src="/a.js"></script>')).toEqual([])
  })

  it('covers the inline script of every page', () => {
    const csp = siteHeaders('public')['Content-Security-Policy']!
    for (const page of ['privacy.html', 'terms.html']) {
      for (const hash of inlineScriptHashes(readFileSync(`public/${page}`, 'utf8'))) expect(csp).toContain(hash)
    }
  })
})
