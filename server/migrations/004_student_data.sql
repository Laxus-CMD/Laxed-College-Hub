-- Schedules, tasks, notes and grades, saved to the student's account. Needs Postgres 15+ for SET NULL (column).
-- Ids come from the browser and are only unique per student, so user_id is part of every key. A row can
-- never point at another student's course or class.

CREATE TABLE student_profiles (
  user_id          uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Goes up by one on every save, so a device can tell that another one saved first.
  revision         integer NOT NULL DEFAULT 0,
  display_name     text NOT NULL DEFAULT '' CHECK (char_length(display_name) <= 60),
  is_demo          boolean NOT NULL DEFAULT false,
  banner_dismissed boolean NOT NULL DEFAULT false,
  -- Null means the app's default scale.
  grade_scale      jsonb,
  prior_cgpa       double precision,
  prior_units      double precision,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- In every table below: seq keeps the order things were added in, and bytes is the size of the record as JSON.

CREATE TABLE courses (
  user_id         uuid NOT NULL REFERENCES student_profiles (user_id) ON DELETE CASCADE,
  id              text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 64),
  code            text NOT NULL CHECK (char_length(code) <= 100),
  name            text NOT NULL CHECK (char_length(name) <= 300),
  units           double precision NOT NULL,
  color           text NOT NULL CHECK (char_length(color) <= 32),
  professor       text CHECK (char_length(professor) <= 300),
  professor_email text CHECK (char_length(professor_email) <= 300),
  office_hours    text CHECK (char_length(office_hours) <= 300),
  grade_override  double precision,
  grade_target    double precision,
  bytes           integer NOT NULL,
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (user_id, id)
);

-- "sessions" is already the sign-in table, so class meetings are class_sessions.
CREATE TABLE class_sessions (
  user_id    uuid NOT NULL REFERENCES student_profiles (user_id) ON DELETE CASCADE,
  id         text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 64),
  course_id  text NOT NULL,
  -- 0 is Sunday.
  days       smallint[] NOT NULL CHECK (cardinality(days) <= 7 AND days <@ '{0,1,2,3,4,5,6}'::smallint[]),
  -- Local wall-clock time, "HH:mm".
  start_time text NOT NULL CHECK (char_length(start_time) <= 8),
  end_time   text NOT NULL CHECK (char_length(end_time) <= 8),
  room       text CHECK (char_length(room) <= 300),
  building   text CHECK (char_length(building) <= 300),
  bytes      integer NOT NULL,
  seq        bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, course_id) REFERENCES courses (user_id, id) ON DELETE CASCADE
);
CREATE INDEX class_sessions_course_idx ON class_sessions (user_id, course_id);

CREATE TABLE tasks (
  user_id     uuid NOT NULL REFERENCES student_profiles (user_id) ON DELETE CASCADE,
  id          text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 64),
  kind        text NOT NULL CHECK (kind IN ('assignment', 'todo')),
  title       text NOT NULL CHECK (char_length(title) <= 1000),
  course_id   text,
  -- Local date or date-time, as typed. Not a timestamp: 11:59 PM stays 11:59 PM in any time zone.
  due         text CHECK (char_length(due) <= 18),
  done        boolean NOT NULL,
  weight      double precision,
  source      text NOT NULL CHECK (source IN ('manual', 'ics')),
  external_id text CHECK (char_length(external_id) <= 500),
  bytes       integer NOT NULL,
  seq         bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, course_id) REFERENCES courses (user_id, id) ON DELETE SET NULL (course_id)
);
CREATE INDEX tasks_course_idx ON tasks (user_id, course_id);
-- Importing the same calendar twice, even on two devices, never makes duplicates.
CREATE UNIQUE INDEX tasks_external_id_key ON tasks (user_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE notes (
  user_id       uuid NOT NULL REFERENCES student_profiles (user_id) ON DELETE CASCADE,
  id            text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 64),
  title         text NOT NULL CHECK (char_length(title) <= 300),
  body          text NOT NULL CHECK (char_length(body) <= 100000),
  course_id     text,
  session_id    text,
  -- "YYYY-MM-DD" of the class meeting. Means nothing once session_id is null.
  session_date  text CHECK (char_length(session_date) <= 12),
  created_at    timestamptz NOT NULL,
  updated_at    timestamptz NOT NULL,
  -- The save and the browser tab that last changed the text, to notice two devices editing at once.
  text_revision integer NOT NULL,
  text_client   text NOT NULL,
  bytes         integer NOT NULL,
  seq           bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, course_id) REFERENCES courses (user_id, id) ON DELETE SET NULL (course_id),
  FOREIGN KEY (user_id, session_id) REFERENCES class_sessions (user_id, id) ON DELETE SET NULL (session_id)
);
CREATE INDEX notes_course_idx ON notes (user_id, course_id);
CREATE INDEX notes_session_idx ON notes (user_id, session_id);

CREATE TABLE grade_components (
  user_id   uuid NOT NULL REFERENCES student_profiles (user_id) ON DELETE CASCADE,
  id        text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 64),
  course_id text NOT NULL,
  name      text NOT NULL CHECK (char_length(name) <= 300),
  weight    double precision NOT NULL,
  -- Null until graded.
  score     double precision,
  bytes     integer NOT NULL,
  seq       bigint GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, course_id) REFERENCES courses (user_id, id) ON DELETE CASCADE
);
CREATE INDEX grade_components_course_idx ON grade_components (user_id, course_id);
