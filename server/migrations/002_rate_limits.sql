-- Rate limit counters, shared by every API instance. Serverless instances come and go, so memory does not work.

CREATE TABLE rate_limits (
  -- SHA-256 of the limiter name and the key, so no emails or IP addresses are stored here.
  key_hash text PRIMARY KEY,
  hits     integer NOT NULL,
  reset_at timestamptz NOT NULL
);

CREATE INDEX rate_limits_reset_at_idx ON rate_limits (reset_at);
