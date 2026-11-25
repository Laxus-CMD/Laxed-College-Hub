-- How long a student expects a task to take, in minutes, for the Workload and Between Classes
-- workspaces. Optional: with none, the app counts tasks and never guesses a time.
ALTER TABLE tasks ADD COLUMN estimate integer CHECK (estimate BETWEEN 5 AND 1440);
