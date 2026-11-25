-- The Tasks workspace mode a student last chose. Null means never chosen: the app opens Classic.
ALTER TABLE student_profiles
  ADD COLUMN task_mode text CHECK (task_mode IN ('classic', 'flow', 'focus', 'workload', 'between'));
