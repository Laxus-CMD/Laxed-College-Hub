-- What sort of assignment a task is, beyond its kind. Only 'exam' so far. Null means none.
ALTER TABLE tasks ADD COLUMN category text CHECK (category IN ('exam'));
