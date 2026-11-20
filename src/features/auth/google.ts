/**
 * Sign in with Google, using Google Identity Services (GIS) in the browser.
 *
 * There is no backend, so the ID token is decoded here only to read the
 * profile (name, email, picture). It is not a security boundary: all data
 * stays in this browser either way.
 */

export interface GoogleUser {
  /** Google's stable account id (the token's `sub`). */
  id: string
  name: string
  givenName: string
  email: string
  picture?: string
}

/** Public OAuth client id. Set VITE_GOOGLE_CLIENT_ID in .env.local (see .env.example). */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface CredentialResponse {
  credential: string
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string
    callback: (res: CredentialResponse) => void
    auto_select?: boolean
    cancel_on_tap_outside?: boolean
    ux_mode?: 'popup' | 'redirect'
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon'
      theme?: 'outline' | 'filled_blue' | 'filled_black'
      size?: 'large' | 'medium' | 'small'
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
      shape?: 'rectangular' | 'pill' | 'circle' | 'square'
      logo_alignment?: 'left' | 'center'
      width?: number
    },
  ): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

let loading: Promise<GoogleIdApi> | null = null

/** Loads the GIS script once and resolves with `google.accounts.id`. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in did not load')))
    script.onerror = () => reject(new Error('Could not reach Google sign-in'))
    document.head.appendChild(script)
  }).catch((err: unknown) => {
    loading = null // let a later attempt retry
    throw err
  })
  return loading
}

function decodeBase64Url(part: string): string {
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/**
 * Reads the profile out of a Google ID token (a JWT).
 * Returns null when the token is malformed, expired or for another app.
 */
export function parseGoogleCredential(credential: string, clientId: string, now: number = Date.now()): GoogleUser | null {
  const parts = credential.split('.')
  if (parts.length !== 3) return null
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(decodeBase64Url(parts[1]!)) as Record<string, unknown>
  } catch {
    return null
  }
  const { sub, email, name, given_name, picture, aud, exp, iss } = claims
  if (typeof sub !== 'string' || typeof email !== 'string') return null
  if (clientId && aud !== clientId) return null
  if (iss !== 'accounts.google.com' && iss !== 'https://accounts.google.com') return null
  if (typeof exp === 'number' && exp * 1000 < now) return null
  const fullName = typeof name === 'string' && name ? name : email
  return {
    id: sub,
    email,
    name: fullName,
    givenName: typeof given_name === 'string' && given_name ? given_name : fullName.split(' ')[0]!,
    picture: typeof picture === 'string' ? picture : undefined,
  }
}
