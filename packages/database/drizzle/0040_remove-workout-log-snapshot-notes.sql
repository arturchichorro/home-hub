-- Workout notes belong only to the shared workout, not its private log snapshots.
-- Existing private log notes, exercise snapshots, dates and sets remain unchanged.
UPDATE public.workout_logs
SET snapshot = snapshot - 'notes'
WHERE snapshot ? 'notes';
