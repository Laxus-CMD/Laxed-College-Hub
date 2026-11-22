-- Sign in with Google, checked by the server. Google-only accounts have no password.

ALTER TABLE users
  ALTER COLUMN password_hash DROP NOT NULL,
  -- Set once the owner of the mailbox has proven it is theirs.
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN picture_url text;

CREATE TABLE auth_identities (
  provider   text NOT NULL CHECK (provider IN ('google')),
  -- The provider's permanent account id (Google's "sub"). Emails can change hands, this cannot.
  subject    text NOT NULL,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (user_id, provider)
);
