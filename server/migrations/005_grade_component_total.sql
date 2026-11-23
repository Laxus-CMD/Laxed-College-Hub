ALTER TABLE grade_components ADD COLUMN total_score double precision CHECK (total_score > 0);
