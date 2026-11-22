/**
 * Loads Google Identity Services (GIS) for the sign-in button. Google gives the
 * browser an ID token, and the College Hub server checks it (server/google.ts).
 */

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
