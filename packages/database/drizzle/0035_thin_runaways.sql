CREATE TABLE "workout_log_sets" (
	"log_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "workout_log_sets_log_id_exercise_id_round_pk" PRIMARY KEY("log_id","exercise_id","round"),
	CONSTRAINT "workout_log_sets_round" CHECK ("workout_log_sets"."round" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "workout_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" text NOT NULL,
	"completed_on" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_logs_status" CHECK ("workout_logs"."status" in ('active', 'completed', 'abandoned')),
	CONSTRAINT "workout_logs_completion" CHECK (("workout_logs"."status" = 'completed') = ("workout_logs"."completed_at" is not null and "workout_logs"."completed_on" is not null))
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"exercises" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workouts_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "workouts_title_length" CHECK (length(trim("workouts"."title")) between 1 and 150)
);
--> statement-breakpoint
ALTER TABLE "workout_log_sets" ADD CONSTRAINT "workout_log_sets_log_id_workout_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."workout_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_household_id_workout_id_workouts_household_id_id_fk" FOREIGN KEY ("household_id","workout_id") REFERENCES "public"."workouts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workout_logs_one_active" ON "workout_logs" USING btree ("household_id","user_id","workout_id") WHERE "workout_logs"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workout_logs_owner" ON "workout_logs" USING btree ("household_id","user_id","workout_id","created_at");
--> statement-breakpoint
-- Forward migration from the already-applied 0034. Stop API/Zero for this
-- contract change. Expand shared plans into standalone workouts and copy every
-- private log/set before removing the superseded tables.
LOCK TABLE public.workout_plans, public.workout_cycles, public.workout_sessions, public.workout_sets IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE FUNCTION pg_temp.simple_workout_id(plan_id uuid, old_id text) RETURNS uuid LANGUAGE sql AS $$
  SELECT overlay(overlay(md5(plan_id::text || ':' || old_id) placing '3' from 13) placing '8' from 17)::uuid;
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.simple_workout_exercises(items jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e->>'id', 'name', e->>'name', 'sets', e->'sets',
    'target', (e->>'min') || '–' || (e->>'max'),
    'unit', e->>'unit', 'unilateral', e->'unilateral', 'load', e->>'load'
  ) ORDER BY ordinal), '[]'::jsonb)
  FROM jsonb_array_elements(items) WITH ORDINALITY AS entries(e, ordinal);
$$;
--> statement-breakpoint
CREATE FUNCTION pg_temp.simple_workout_notes(content jsonb, exercise_list jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws(E'\n\n', nullif(content->>'warmup',''),
    (SELECT string_agg((e->>'name') || ': ' || (e->>'cues'), E'\n' ORDER BY ordinal)
     FROM jsonb_array_elements(exercise_list) WITH ORDINALITY AS entries(e, ordinal) WHERE coalesce(e->>'cues','') <> ''),
    nullif(content->>'finish',''), nullif(content->>'guidance',''));
$$;
--> statement-breakpoint
INSERT INTO public.workouts (id, household_id, title, notes, exercises, created_at, updated_at)
SELECT pg_temp.simple_workout_id(p.id, w->>'id'), p.household_id, w->>'name',
  pg_temp.simple_workout_notes(p.definition, w->'exercises'),
  pg_temp.simple_workout_exercises(w->'exercises'), p.created_at, p.updated_at
FROM public.workout_plans p CROSS JOIN LATERAL jsonb_array_elements(p.definition->'workouts') AS w;
--> statement-breakpoint
-- Also recover workouts removed from a plan but still referenced by its history.
INSERT INTO public.workouts (id, household_id, title, notes, exercises, created_at, updated_at)
SELECT DISTINCT ON (c.plan_id, s.workout_id)
  pg_temp.simple_workout_id(c.plan_id, s.workout_id::text), s.household_id,
  s.snapshot->'workout'->>'name',
  pg_temp.simple_workout_notes(s.snapshot, s.snapshot->'workout'->'exercises'),
  pg_temp.simple_workout_exercises(s.snapshot->'workout'->'exercises'), s.created_at, s.created_at
FROM public.workout_sessions s JOIN public.workout_cycles c ON c.id = s.cycle_id
ORDER BY c.plan_id, s.workout_id, s.created_at DESC, s.id DESC
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO public.workout_logs (id, household_id, user_id, workout_id, snapshot, status, completed_on, completed_at, created_at)
SELECT s.id, s.household_id, s.user_id, pg_temp.simple_workout_id(c.plan_id, s.workout_id::text),
  jsonb_build_object(
    'title', s.snapshot->'workout'->>'name',
    'notes', concat_ws(E'\n\n',
      nullif(pg_temp.simple_workout_notes(s.snapshot, s.snapshot->'workout'->'exercises'), ''),
      nullif(s.note, ''),
      CASE WHEN s.low_energy THEN 'Low-energy session.' END,
      (SELECT string_agg((es->>'name') || ', set ' || ws.round::text || ': ' || ws.values::text, E'\n' ORDER BY ws.exercise_id, ws.round)
       FROM public.workout_sets ws
       LEFT JOIN LATERAL jsonb_array_elements(s.snapshot->'workout'->'exercises') es ON es->>'id' = ws.exercise_id::text
       WHERE ws.session_id = s.id)),
    'exercises', pg_temp.simple_workout_exercises(s.snapshot->'workout'->'exercises')
  ), s.status, s.completed_on, s.completed_at, s.created_at
FROM public.workout_sessions s JOIN public.workout_cycles c ON c.id = s.cycle_id;
--> statement-breakpoint
INSERT INTO public.workout_log_sets (log_id, exercise_id, round, values)
SELECT session_id, exercise_id, round, jsonb_build_object(
  'weightKg', values->'weightKg', 'amount', values->'amount', 'rightAmount', values->'rightAmount'
) FROM public.workout_sets;
--> statement-breakpoint
DO $$ BEGIN
  IF (SELECT count(*) FROM public.workout_sessions) <> (SELECT count(*) FROM public.workout_logs)
    OR (SELECT count(*) FROM public.workout_sets) <> (SELECT count(*) FROM public.workout_log_sets) THEN
    RAISE EXCEPTION 'Workout history backfill is incomplete';
  END IF;
END $$;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero DROP TABLE public.workout_sets, public.workout_sessions, public.workout_cycles, public.workout_plans;
--> statement-breakpoint
-- Dependents first; no CASCADE, so unexpected references fail rather than vanish.
DROP TABLE public.workout_sets;
--> statement-breakpoint
DROP TABLE public.workout_sessions;
--> statement-breakpoint
DROP TABLE public.workout_cycles;
--> statement-breakpoint
DROP TABLE public.workout_plans;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE public.workouts, public.workout_logs, public.workout_log_sets;
