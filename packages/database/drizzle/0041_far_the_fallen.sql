-- Contract migration: back up, stop API/Zero, migrate, deploy matching code,
-- then restart and reload clients. Historical log snapshots/sets are untouched.
LOCK TABLE public.workouts IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "workout_exercises" (
	"id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"sort_key" integer DEFAULT 0 NOT NULL,
	"name" text NOT NULL,
	"sets" integer NOT NULL,
	"target" text NOT NULL,
	"unit" text NOT NULL,
	"unilateral" boolean NOT NULL,
	"load" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_exercises_workout_id_id_pk" PRIMARY KEY("workout_id","id"),
	CONSTRAINT "workout_exercises_name_length" CHECK (length(trim("workout_exercises"."name")) between 1 and 150),
	CONSTRAINT "workout_exercises_sets" CHECK ("workout_exercises"."sets" between 1 and 10),
	CONSTRAINT "workout_exercises_target_length" CHECK (length("workout_exercises"."target") <= 100),
	CONSTRAINT "workout_exercises_unit" CHECK ("workout_exercises"."unit" in ('reps', 'seconds')),
	CONSTRAINT "workout_exercises_load" CHECK ("workout_exercises"."load" in ('per-hand', 'single', 'bodyweight'))
);
--> statement-breakpoint
ALTER TABLE "workout_exercises" ADD CONSTRAINT "workout_exercises_household_id_workout_id_workouts_household_id_id_fk" FOREIGN KEY ("household_id","workout_id") REFERENCES "public"."workouts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_exercises_workout_order" ON "workout_exercises" USING btree ("household_id","workout_id","sort_key","id");--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.workouts WHERE jsonb_typeof(exercises) <> 'array' OR jsonb_array_length(exercises) > 40) THEN
    RAISE EXCEPTION 'Invalid workout exercise definitions; migration aborted';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO public.workout_exercises (id, household_id, workout_id, sort_key, name, sets, target, unit, unilateral, load, created_at, updated_at)
SELECT (e.value->>'id')::uuid, w.household_id, w.id,
  ((jsonb_array_length(w.exercises) - e.ordinality + 1) * 1024)::integer,
  e.value->>'name', (e.value->>'sets')::integer, e.value->>'target',
  e.value->>'unit', (e.value->>'unilateral')::boolean, e.value->>'load', w.created_at, w.updated_at
FROM public.workouts w CROSS JOIN LATERAL jsonb_array_elements(w.exercises) WITH ORDINALITY AS e(value, ordinality);
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM public.workouts w WHERE w.exercises IS DISTINCT FROM coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'name', e.name, 'sets', e.sets, 'target', e.target,
        'unit', e.unit, 'unilateral', e.unilateral, 'load', e.load
      ) ORDER BY e.sort_key DESC, e.id ASC)
      FROM public.workout_exercises e WHERE e.household_id = w.household_id AND e.workout_id = w.id
    ), '[]'::jsonb)
  ) THEN RAISE EXCEPTION 'Workout exercise copy verification failed'; END IF;
END $$;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE public.workout_exercises;
--> statement-breakpoint
ALTER TABLE "public"."workouts" DROP COLUMN "exercises";