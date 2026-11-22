import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

/** Hashes of the inline scripts in some HTML, as a Content-Security-Policy lists them. */
export function inlineScriptHashes(html: string): string[] {
  // Browsers hash the text with normal line endings, whatever the file has.
  return [...html.replaceAll('\r\n', '\n').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    ([, code]) => `'sha256-${createHash('sha256').update(code!).digest('base64')}'`,
  )
}

/**
 * What a page of the site may load and talk to. Even if someone found a way to put their own
 * markup into a page, the browser would not run their script or send data to their server.
 * The Google entries are the ones its sign-in button needs:
 * https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy
 */
export function contentSecurityPolicy(scriptHashes: string[]): string {
  return [
    "default-src 'none'",
    ["script-src 'self' https://accounts.google.com/gsi/client", ...scriptHashes].join(' '),
    // React and the Google button set styles directly.
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: https://*.googleusercontent.com",
    "font-src 'self'",
    "connect-src 'self' https://accounts.google.com/gsi/",
    'frame-src https://accounts.google.com/gsi/',
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // Nobody can put the site in a frame and trick people into clicking, for example, Delete account.
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

/** Headers for every page and file of the site. The API sets its own, stricter ones. */
export function siteHeaders(dist: string): Record<string, string> {
  const pages = readdirSync(dist).filter((name) => name.endsWith('.html'))
  const hashes = pages.flatMap((name) => inlineScriptHashes(readFileSync(path.join(dist, name), 'utf8')))
  return {
    'Content-Security-Policy': contentSecurityPolicy([...new Set(hashes)]),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Google's sign-in popup needs to talk back to the page.
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  }
}
