-- Contract migration: stop the old API/Zero before applying, then reload clients.
-- Unfinished entries are intentionally discarded; completed history is retained.
LOCK TABLE public.workout_logs, public.workout_log_sets IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DELETE FROM public.workout_log_sets s USING public.workout_logs l
WHERE s.log_id = l.id AND l.status <> 'completed';
--> statement-breakpoint
DELETE FROM public.workout_logs WHERE status <> 'completed';
--> statement-breakpoint
ALTER TABLE "workout_logs" DROP CONSTRAINT "workout_logs_status";--> statement-breakpoint
ALTER TABLE "workout_logs" DROP CONSTRAINT "workout_logs_completion";--> statement-breakpoint
DROP INDEX "workout_logs_one_active";--> statement-breakpoint
ALTER TABLE "workout_logs" ALTER COLUMN "completed_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_logs" ALTER COLUMN "completed_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_logs" DROP COLUMN "status";