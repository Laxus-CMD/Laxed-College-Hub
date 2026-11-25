-- The first and last day a class meets, for academic terms. Null means no limit.
ALTER TABLE class_sessions ADD COLUMN starts_on text CHECK (starts_on ~ '^\d{4,6}-\d{2}-\d{2}$');
ALTER TABLE class_sessions ADD COLUMN ends_on text CHECK (ends_on ~ '^\d{4,6}-\d{2}-\d{2}$');
