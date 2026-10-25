-- Keep the most recently completed log per author/workout/day, as requested.
-- Back up and stop the old API/Zero before applying this contract migration.
LOCK TABLE public.workout_logs, public.workout_log_sets IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY household_id, user_id, workout_id, completed_on
    ORDER BY completed_at DESC, created_at DESC, id DESC
  ) AS position FROM public.workout_logs
)
DELETE FROM public.workout_log_sets s USING ranked r WHERE s.log_id = r.id AND r.position > 1;
--> statement-breakpoint
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY household_id, user_id, workout_id, completed_on
    ORDER BY completed_at DESC, created_at DESC, id DESC
  ) AS position FROM public.workout_logs
)
DELETE FROM public.workout_logs l USING ranked r WHERE l.id = r.id AND r.position > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "workout_logs_one_per_day" ON "public"."workout_logs" USING btree ("household_id","user_id","workout_id","completed_on");
