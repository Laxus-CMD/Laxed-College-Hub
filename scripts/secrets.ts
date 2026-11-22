/**
 * Keeps secrets out of the browser bundle and out of this public repository.
 * The build fails when checkBundle() finds something (vite.config.ts), and a test scans every
 * tracked file (tests/security.test.ts). Nothing here ever prints a secret, only where it is.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const PATTERNS: [name: string, pattern: RegExp][] = [
  // Placeholders such as <password>, … localhost and the reserved .example hosts are fine.
  ['a database address with a password', /postgres(?:ql)?:\/\/[^\s:'"`<>@/]+:(?![<…*])[^\s@'"`<>]+@(?!localhost|127\.0\.0\.1|[\w.-]+\.example\b)[^\s'"`<>]+/i],
  ['a Neon password', /\bnpg_[A-Za-z0-9]{8,}/],
  ['a Google API key', /\bAIza[\w-]{35}/],
  ['a Google client secret', /\bGOCSPX-[\w-]{10,}/],
  ['a Google access token', /\bya29\.[\w-]{20,}/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_\w{40,})/],
  ['an AWS key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a secret API key', /\bsk[-_](?:live|test|ant|proj)[-_][\w-]{16,}/],
  ['a Slack token', /\bxox[abprs]-[\w-]{10,}/],
  ['a Vercel token', /\bvc[pkr]_[A-Za-z0-9]{20,}/],
  ['a private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['a signed token (JWT)', /\beyJ[\w-]{15,}\.eyJ[\w-]{15,}\.[\w-]{10,}/],
]

/** The kinds of secret found in some text, each with its line number. */
export function findSecrets(text: string): string[] {
  return PATTERNS.flatMap(([name, pattern]) => {
    const at = pattern.exec(text)
    return at ? [`${name} (line ${text.slice(0, at.index).split('\n').length})`] : []
  })
}

/** Everything named VITE_… can end up in the browser. These are the only ones meant to. */
const PUBLIC_ENV = /^VITE_(?:GOOGLE_CLIENT_ID|API_BASE|VERCEL_\w+)$/
const PRIVATE_ENV = /DATABASE|POSTGRES|^PG|PASS|SECRET|TOKEN|PRIVATE|CREDENTIAL|API_?KEY/i

/** The values of private settings, including the password inside a database address. */
function privateValues(env: Record<string, string | undefined>): [name: string, value: string][] {
  return Object.entries(env).flatMap(([name, value]) => {
    if (!value || name.startsWith('VITE_') || !PRIVATE_ENV.test(name)) return []
    const password = URL.canParse(value) ? decodeURIComponent(new URL(value).password) : ''
    return [value, password].filter((v) => v.length >= 8).map((v): [string, string] => [name, v])
  })
}

/** Problems with a built site. An empty list means nothing private is in it. */
export function checkBundle(dir: string, env: Record<string, string | undefined> = {}): string[] {
  const problems = Object.keys(env)
    .filter((name) => name.startsWith('VITE_') && !PUBLIC_ENV.test(name))
    .map((name) => `${name} would be readable by everyone. Remove VITE_ from its name, or allow it in scripts/secrets.ts if it is not a secret.`)
  const secrets = privateValues(env)

  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    const label = path.relative(dir, file).replaceAll('\\', '/')
    // Source maps hand out the original code, comments included.
    if (label.endsWith('.map')) problems.push(`${label} is a source map.`)
    if (/(?:^|\/)\.env|\.(?:pem|key|sql|dump|gpg)$/.test(label)) problems.push(`${label} must not be published.`)
    const text = readFileSync(file, 'utf8')
    for (const found of findSecrets(text)) problems.push(`${label} contains ${found}.`)
    for (const [name, value] of secrets) if (text.includes(value)) problems.push(`${label} contains the value of ${name}.`)
  }
  return problems
}
