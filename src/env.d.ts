interface ImportMetaEnv {
  /** Public Google OAuth client id for Sign in with Google. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
