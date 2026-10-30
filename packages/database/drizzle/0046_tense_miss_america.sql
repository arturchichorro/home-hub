CREATE TABLE "exercise_log_sets" (
	"exercise_log_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"amount" integer NOT NULL,
	"right_amount" integer,
	"weight_kg" numeric,
	"unit" text NOT NULL,
	"load" text NOT NULL,
	"unilateral" boolean NOT NULL,
	CONSTRAINT "exercise_log_sets_exercise_log_id_round_pk" PRIMARY KEY("exercise_log_id","round"),
	CONSTRAINT "exercise_log_sets_round" CHECK ("exercise_log_sets"."round" between 1 and 10),
	CONSTRAINT "exercise_log_sets_amount" CHECK ("exercise_log_sets"."amount" between 0 and 600),
	CONSTRAINT "exercise_log_sets_right" CHECK ("exercise_log_sets"."right_amount" is null or ("exercise_log_sets"."unilateral" and "exercise_log_sets"."right_amount" between 0 and 600)),
	CONSTRAINT "exercise_log_sets_weight" CHECK ("exercise_log_sets"."weight_kg" is null or ("exercise_log_sets"."load" <> 'bodyweight' and "exercise_log_sets"."weight_kg" between 0 and 1000)),
	CONSTRAINT "exercise_log_sets_unit" CHECK ("exercise_log_sets"."unit" in ('reps', 'seconds')),
	CONSTRAINT "exercise_log_sets_load" CHECK ("exercise_log_sets"."load" in ('per-hand', 'single', 'bodyweight'))
);
--> statement-breakpoint
CREATE TABLE "exercise_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"performed_on" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "exercise_logs_author_id" UNIQUE("household_id","user_id","id")
);
--> statement-breakpoint
CREATE TABLE "workout_log_exercises" (
	"workout_log_id" uuid NOT NULL,
	"workout_exercise_id" uuid NOT NULL,
	"exercise_log_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "workout_log_exercises_workout_log_id_workout_exercise_id_pk" PRIMARY KEY("workout_log_id","workout_exercise_id"),
	CONSTRAINT "workout_log_exercises_exercise_log_id_unique" UNIQUE("exercise_log_id")
);
--> statement-breakpoint
ALTER TABLE "exercise_log_sets" ADD CONSTRAINT "exercise_log_sets_exercise_log_id_exercise_logs_id_fk" FOREIGN KEY ("exercise_log_id") REFERENCES "public"."exercise_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_logs" ADD CONSTRAINT "exercise_logs_household_id_exercise_id_exercises_household_id_id_fk" FOREIGN KEY ("household_id","exercise_id") REFERENCES "public"."exercises"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_author_id" UNIQUE("household_id","user_id","id");
--> statement-breakpoint
ALTER TABLE "workout_log_exercises" ADD CONSTRAINT "workout_log_exercises_household_id_user_id_workout_log_id_workout_logs_household_id_user_id_id_fk" FOREIGN KEY ("household_id","user_id","workout_log_id") REFERENCES "public"."workout_logs"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_log_exercises" ADD CONSTRAINT "workout_log_exercises_household_id_user_id_exercise_log_id_exercise_logs_household_id_user_id_id_fk" FOREIGN KEY ("household_id","user_id","exercise_log_id") REFERENCES "public"."exercise_logs"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_logs_latest" ON "exercise_logs" USING btree ("household_id","user_id","exercise_id","performed_on","performed_at","id");--> statement-breakpoint
-- Stable mapping preserves every historical slot, including removed slots.
INSERT INTO exercise_logs (id, household_id, user_id, exercise_id, performed_on, performed_at, snapshot)
SELECT DISTINCT md5(s.log_id::text || ':' || s.workout_exercise_id::text)::uuid,
 l.household_id, l.user_id, s.exercise_id, l.completed_on, l.completed_at, e.value
FROM workout_log_sets s JOIN workout_logs l ON l.id=s.log_id AND l.household_id=s.household_id
CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') WITH ORDINALITY e(value, position)
WHERE e.value->>'id'=s.workout_exercise_id::text;
--> statement-breakpoint
INSERT INTO workout_log_exercises (workout_log_id, workout_exercise_id, exercise_log_id, household_id, user_id, position)
SELECT DISTINCT s.log_id, s.workout_exercise_id,
 md5(s.log_id::text || ':' || s.workout_exercise_id::text)::uuid, l.household_id, l.user_id, (e.position-1)::integer
FROM workout_log_sets s JOIN workout_logs l ON l.id=s.log_id AND l.household_id=s.household_id
CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') WITH ORDINALITY e(value, position)
WHERE e.value->>'id'=s.workout_exercise_id::text;
--> statement-breakpoint
INSERT INTO exercise_log_sets (exercise_log_id, round, amount, right_amount, weight_kg, unit, load, unilateral)
SELECT md5(log_id::text || ':' || workout_exercise_id::text)::uuid, round, amount, right_amount, weight_kg, unit, load, unilateral
FROM workout_log_sets;
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
  (SELECT log_id, household_id, workout_exercise_id, exercise_id, round, amount, right_amount, weight_kg, unit, load, unilateral FROM workout_log_sets
   EXCEPT ALL
   SELECT w.workout_log_id, w.household_id, w.workout_exercise_id, e.exercise_id, s.round, s.amount, s.right_amount, s.weight_kg, s.unit, s.load, s.unilateral
   FROM exercise_log_sets s JOIN exercise_logs e ON e.id=s.exercise_log_id JOIN workout_log_exercises w ON w.exercise_log_id=e.id)
  UNION ALL
  (SELECT w.workout_log_id, w.household_id, w.workout_exercise_id, e.exercise_id, s.round, s.amount, s.right_amount, s.weight_kg, s.unit, s.load, s.unilateral
   FROM exercise_log_sets s JOIN exercise_logs e ON e.id=s.exercise_log_id JOIN workout_log_exercises w ON w.exercise_log_id=e.id
   EXCEPT ALL
   SELECT log_id, household_id, workout_exercise_id, exercise_id, round, amount, right_amount, weight_kg, unit, load, unilateral FROM workout_log_sets)
 ) THEN RAISE EXCEPTION 'Exercise log backfill changed historical measurements'; END IF;
END $$;
--> statement-breakpoint
-- The old table remains an untouched migration archive for recovery; new logging
-- must use exercise_logs/exercise_log_sets, not write a second source of truth.
ALTER PUBLICATION home_hub_zero ADD TABLE exercise_logs, exercise_log_sets, workout_log_exercises;