-- Contract migration: back up and stop API/Zero; migrate, deploy matching code,
-- restart and reload clients. No production database is changed by generating this file.
LOCK TABLE public.workouts, public.workout_exercises, public.workout_logs, public.workout_log_sets IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "public"."exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"unit" text NOT NULL,
	"load" text NOT NULL,
	"unilateral" boolean NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "exercises_name_length" CHECK (length(trim("exercises"."name")) between 1 and 150),
	CONSTRAINT "exercises_unit" CHECK ("exercises"."unit" in ('reps', 'seconds')),
	CONSTRAINT "exercises_load" CHECK ("exercises"."load" in ('per-hand', 'single', 'bodyweight'))
);

--> statement-breakpoint
CREATE FUNCTION pg_temp.exercise_key(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(regexp_replace(normalize(value, NFKC), '\s+', ' ', 'g')));
$$;
--> statement-breakpoint
CREATE TEMP TABLE exercise_candidates ON COMMIT DROP AS
SELECT w.household_id, w.name, pg_temp.exercise_key(w.name) AS normalized_name, w.unit, w.load, w.unilateral,
  w.updated_at AS source_at, w.created_at AS created_at, false AS historical,
  w.workout_id::text || ':' || w.id::text AS source_key
FROM public.workout_exercises w
UNION ALL
SELECT l.household_id, coalesce(w.name, e.value->>'name'),
  pg_temp.exercise_key(coalesce(w.name, e.value->>'name')),
  e.value->>'unit', e.value->>'load', (e.value->>'unilateral')::boolean,
  l.completed_at, l.created_at, true, l.id::text || ':' || (e.value->>'id')
FROM public.workout_logs l CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') e(value)
LEFT JOIN public.workout_exercises w ON w.household_id=l.household_id AND w.workout_id=l.workout_id AND w.id=(e.value->>'id')::uuid;
--> statement-breakpoint
CREATE TEMP TABLE exercise_identity_map ON COMMIT DROP AS
SELECT household_id, normalized_name,
  overlay(overlay(md5('exercise-catalog:' || household_id::text || ':' || normalized_name) placing '3' from 13) placing '8' from 17)::uuid AS id,
  bool_and(historical) AS archived, min(created_at) AS created_at
FROM exercise_candidates GROUP BY household_id, normalized_name;
--> statement-breakpoint
-- Current definitions win over historical ones; conflicting current settings use
-- the most recently edited definition. Historical set measurements never change.
INSERT INTO public.exercises(id, household_id, name, normalized_name, unit, load, unilateral, archived, created_at, updated_at)
SELECT DISTINCT ON (c.household_id,c.normalized_name)
  m.id, c.household_id, c.name, c.normalized_name, c.unit, c.load, c.unilateral, m.archived, m.created_at, c.source_at
FROM exercise_candidates c JOIN exercise_identity_map m USING(household_id, normalized_name)
ORDER BY c.household_id, c.normalized_name, c.historical ASC, c.source_at DESC, c.source_key DESC;
--> statement-breakpoint
ALTER TABLE public.workout_exercises ADD COLUMN exercise_id uuid;
--> statement-breakpoint
UPDATE public.workout_exercises w SET exercise_id=m.id FROM exercise_identity_map m
WHERE m.household_id=w.household_id AND m.normalized_name=pg_temp.exercise_key(w.name);
--> statement-breakpoint
-- Enrich history with stable catalog identity without changing any historical
-- names/settings. Catalog entries derived only from private history stay hidden.
UPDATE public.workout_logs l SET snapshot=jsonb_set(l.snapshot,'{exercises}',coalesce((
  SELECT jsonb_agg(e.value || jsonb_build_object('catalogExerciseId',m.id) ORDER BY e.ordinality)
  FROM jsonb_array_elements(l.snapshot->'exercises') WITH ORDINALITY e(value,ordinality)
  LEFT JOIN public.workout_exercises w ON w.household_id=l.household_id AND w.workout_id=l.workout_id AND w.id=(e.value->>'id')::uuid
  JOIN exercise_identity_map m ON m.household_id=l.household_id AND m.normalized_name=pg_temp.exercise_key(coalesce(w.name,e.value->>'name'))
),'[]'::jsonb));
--> statement-breakpoint
ALTER TABLE public.workout_log_sets REPLICA IDENTITY FULL;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets DROP CONSTRAINT workout_log_sets_log_id_exercise_id_round_pk;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets DROP CONSTRAINT workout_log_sets_log_id_workout_logs_id_fk;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets
  ADD COLUMN household_id uuid,
  ADD COLUMN workout_exercise_id uuid,
  ADD COLUMN amount integer,
  ADD COLUMN right_amount integer,
  ADD COLUMN weight_kg numeric,
  ADD COLUMN unit text,
  ADD COLUMN load text,
  ADD COLUMN unilateral boolean;
--> statement-breakpoint
UPDATE public.workout_log_sets s SET
  household_id=l.household_id, workout_exercise_id=s.exercise_id,
  exercise_id=(e.value->>'catalogExerciseId')::uuid,
  amount=(s.values->>'amount')::integer, right_amount=(s.values->>'rightAmount')::integer,
  weight_kg=(s.values->>'weightKg')::numeric,
  unit=e.value->>'unit', load=e.value->>'load', unilateral=(e.value->>'unilateral')::boolean
FROM public.workout_logs l CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') e(value)
WHERE l.id=s.log_id AND (e.value->>'id')::uuid=s.exercise_id;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.workout_exercises WHERE exercise_id IS NULL) THEN
    RAISE EXCEPTION 'Catalog mapping failed for a workout exercise';
  END IF;
  IF EXISTS(SELECT 1 FROM public.workout_log_sets WHERE workout_exercise_id IS NULL OR amount IS NULL OR household_id IS NULL OR unit IS NULL OR load IS NULL OR unilateral IS NULL
    OR jsonb_build_object('amount',amount,'rightAmount',right_amount,'weightKg',weight_kg) IS DISTINCT FROM values) THEN
    RAISE EXCEPTION 'Logged numeric values could not be copied exactly';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.exercises ADD CONSTRAINT exercises_household_id_households_id_fk FOREIGN KEY(household_id) REFERENCES public.households(id);
--> statement-breakpoint
CREATE UNIQUE INDEX exercises_household_name ON public.exercises(household_id,normalized_name);
--> statement-breakpoint
ALTER TABLE public.workout_exercises ALTER COLUMN exercise_id SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.workout_exercises ADD CONSTRAINT workout_exercises_catalog_fk FOREIGN KEY(household_id,exercise_id) REFERENCES public.exercises(household_id,id);
--> statement-breakpoint
ALTER TABLE public.workout_logs ADD CONSTRAINT workout_logs_household_id_id UNIQUE(household_id,id);
--> statement-breakpoint
ALTER TABLE public.workout_log_sets
  ALTER COLUMN household_id SET NOT NULL, ALTER COLUMN workout_exercise_id SET NOT NULL,
  ALTER COLUMN amount SET NOT NULL, ALTER COLUMN unit SET NOT NULL,
  ALTER COLUMN load SET NOT NULL, ALTER COLUMN unilateral SET NOT NULL;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_log_id_workout_exercise_id_round_pk PRIMARY KEY(log_id,workout_exercise_id,round);
--> statement-breakpoint
ALTER TABLE public.workout_log_sets REPLICA IDENTITY DEFAULT;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_log_fk FOREIGN KEY(household_id,log_id) REFERENCES public.workout_logs(household_id,id);
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_catalog_fk FOREIGN KEY(household_id,exercise_id) REFERENCES public.exercises(household_id,id);
--> statement-breakpoint
CREATE INDEX workout_log_sets_exercise ON public.workout_log_sets(household_id,exercise_id,log_id);
--> statement-breakpoint
ALTER TABLE public.workout_exercises DROP CONSTRAINT workout_exercises_name_length;
--> statement-breakpoint
ALTER TABLE public.workout_exercises DROP CONSTRAINT workout_exercises_unit;
--> statement-breakpoint
ALTER TABLE public.workout_exercises DROP CONSTRAINT workout_exercises_load;
--> statement-breakpoint
ALTER TABLE public.workout_exercises DROP COLUMN name, DROP COLUMN unit, DROP COLUMN load, DROP COLUMN unilateral;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets DROP COLUMN values;
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_amount CHECK(amount between 0 and 600);
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_right_amount CHECK(right_amount IS NULL OR (unilateral AND right_amount between 0 and 600));
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_weight CHECK(weight_kg IS NULL OR (load <> 'bodyweight' AND weight_kg between 0 and 1000));
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_unit CHECK(unit in ('reps','seconds'));
--> statement-breakpoint
ALTER TABLE public.workout_log_sets ADD CONSTRAINT workout_log_sets_load CHECK(load in ('per-hand','single','bodyweight'));
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE public.exercises;
