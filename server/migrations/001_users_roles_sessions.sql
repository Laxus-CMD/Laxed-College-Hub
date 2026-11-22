-- Users, roles and sessions for College Hub accounts.

CREATE TABLE roles (
  id          smallint PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  description text NOT NULL
);

INSERT INTO roles (id, name, description) VALUES
  (1, 'admin', 'Manages accounts and roles'),
  (2, 'user',  'A student using the app');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lower-cased and trimmed by the API. The unique index guards against case variants anyway.
  email         text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  -- scrypt$N$r$p$salt$hash. Never a plain password.
  password_hash text NOT NULL,
  role_id       smallint NOT NULL DEFAULT 2 REFERENCES roles (id),
  is_active     boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE INDEX users_role_id_idx ON users (role_id);

CREATE TABLE sessions (
  -- SHA-256 of the cookie token. The token itself is never stored, so a database leak cannot be replayed.
  id           text PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- Security-relevant events: sign-ups, logins, failed logins, role changes.
CREATE TABLE audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
  target_id  uuid REFERENCES users (id) ON DELETE SET NULL,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
