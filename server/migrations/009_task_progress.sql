-- How far along an open task is, for the Flow workspace. Null means not started. Completion is
-- still only `done`: a finished task keeps its progress, so reopening it puts it back where it was.
ALTER TABLE tasks ADD COLUMN progress text CHECK (progress IN ('started'));
