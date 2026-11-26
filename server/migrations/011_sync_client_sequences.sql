-- The profile lock serializes the sequence check with the student data mutation.
CREATE TABLE sync_client_sequences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  touched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);
