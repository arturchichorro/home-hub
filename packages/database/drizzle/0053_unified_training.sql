CREATE TABLE "training_session_exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"template_exercise_id" uuid,
	"position" integer NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"load" text NOT NULL,
	"unilateral" boolean NOT NULL,
	"role" text NOT NULL,
	"planned_sets" integer,
	"target" text,
	"performed_on" text NOT NULL,
	"performed_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "training_exercises_definition" CHECK ("training_session_exercises"."unit" in ('reps', 'seconds') and "training_session_exercises"."load" in ('per-hand', 'single', 'bodyweight') and "training_session_exercises"."role" in ('warmup', 'workout', 'stretching')),
	CONSTRAINT "training_exercises_prescription" CHECK ("training_session_exercises"."planned_sets" is null or "training_session_exercises"."planned_sets" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "training_session_sets" (
	"session_exercise_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"amount" integer NOT NULL,
	"right_amount" integer,
	"weight_kg" numeric,
	"unit" text NOT NULL,
	"load" text NOT NULL,
	"unilateral" boolean NOT NULL,
	CONSTRAINT "training_session_sets_session_exercise_id_round_pk" PRIMARY KEY("session_exercise_id","round"),
	CONSTRAINT "training_sets_round" CHECK ("training_session_sets"."round" between 1 and 10),
	CONSTRAINT "training_sets_amount" CHECK ("training_session_sets"."amount" between 0 and 600),
	CONSTRAINT "training_sets_right" CHECK ("training_session_sets"."right_amount" is null or ("training_session_sets"."unilateral" and "training_session_sets"."right_amount" between 0 and 600)),
	CONSTRAINT "training_sets_weight" CHECK ("training_session_sets"."weight_kg" is null or ("training_session_sets"."load" <> 'bodyweight' and "training_session_sets"."weight_kg" between 0 and 1000)),
	CONSTRAINT "training_sets_unit" CHECK ("training_session_sets"."unit" in ('reps', 'seconds')),
	CONSTRAINT "training_sets_load" CHECK ("training_session_sets"."load" in ('per-hand', 'single', 'bodyweight'))
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workout_id" uuid,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"completed_on" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "training_sessions_author_id" UNIQUE("household_id","user_id","id")
);
--> statement-breakpoint
-- Coordinated cutover: no old writers may run during/after this transaction.
-- Preserve every original table (including strict snapshots) outside the live model.
LOCK TABLE workout_logs, workout_log_exercises, exercise_logs, exercise_log_sets, workout_log_sets IN ACCESS EXCLUSIVE MODE;

DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM exercise_logs x LEFT JOIN workout_log_exercises w ON w.exercise_log_id=x.id
   WHERE w.exercise_log_id IS NULL OR w.household_id<>x.household_id OR w.user_id<>x.user_id) THEN
   RAISE EXCEPTION 'Training migration: orphan or inconsistent exercise occurrence';
 END IF;
 IF EXISTS (SELECT 1 FROM workout_logs l WHERE jsonb_typeof(l.snapshot->'exercises') IS DISTINCT FROM 'array'
   OR jsonb_typeof(l.snapshot->'title') IS DISTINCT FROM 'string'
   OR length(trim(l.snapshot->>'title'))=0
   OR jsonb_typeof(l.exercise_roles) IS DISTINCT FROM 'object') THEN
   RAISE EXCEPTION 'Training migration: invalid session snapshot';
 END IF;
 IF EXISTS (SELECT 1 FROM workout_logs l CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') e
   GROUP BY l.id HAVING count(*)<>count(DISTINCT e->>'id')) THEN
   RAISE EXCEPTION 'Training migration: ambiguous repeated placement identity';
 END IF;
 IF EXISTS (
  SELECT 1 FROM workout_logs l CROSS JOIN LATERAL jsonb_object_keys(l.exercise_roles) r(id)
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(l.snapshot->'exercises') e WHERE e->>'id'=r.id)
 ) THEN RAISE EXCEPTION 'Training migration: role has no historical placement'; END IF;
 IF EXISTS (
  SELECT 1 FROM workout_log_exercises w JOIN workout_logs l ON l.id=w.workout_log_id
  LEFT JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') WITH ORDINALITY e(value,position)
   ON e.value->>'id'=w.workout_exercise_id::text
  WHERE (e.value IS NOT NULL AND w.position<>e.position-1)
   OR (e.value IS NULL AND w.position<jsonb_array_length(l.snapshot->'exercises'))
 ) OR EXISTS (SELECT 1 FROM workout_log_exercises GROUP BY workout_log_id,position HAVING count(*)>1)
 THEN RAISE EXCEPTION 'Training migration: ambiguous occurrence ordering'; END IF;
 IF EXISTS (
  SELECT 1 FROM exercise_logs x JOIN workout_log_exercises w ON w.exercise_log_id=x.id
  JOIN workout_logs l ON l.id=w.workout_log_id
  CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') e
  WHERE e->>'id'=w.workout_exercise_id::text
   AND (ROW(x.snapshot->'name',x.snapshot->'unit',x.snapshot->'load',x.snapshot->'unilateral',x.snapshot->'sets',coalesce(x.snapshot->>'target',''))
    IS DISTINCT FROM ROW(e->'name',e->'unit',e->'load',e->'unilateral',e->'sets',coalesce(e->>'target',''))
    OR (x.snapshot->>'role' IS NOT NULL AND x.snapshot->>'role'<>coalesce(l.exercise_roles->>(e->>'id'),e->>'role','workout')))
 ) THEN RAISE EXCEPTION 'Training migration: conflicting frozen definitions'; END IF;
 IF EXISTS (
  SELECT 1 FROM exercise_logs x
  WHERE x.snapshot->>'catalogExerciseId' IS NOT NULL AND x.snapshot->>'catalogExerciseId'<>x.exercise_id::text
 ) THEN RAISE EXCEPTION 'Training migration: conflicting catalog identity'; END IF;
END $$;
--> statement-breakpoint
INSERT INTO training_sessions (id, household_id, user_id, workout_id, name, note, completed_on, completed_at, created_at)
SELECT id, household_id, user_id, workout_id, snapshot->>'title', note, completed_on, completed_at, created_at
FROM workout_logs;
--> statement-breakpoint
-- All prescribed exercises survive, including unperformed/removed template slots.
INSERT INTO training_session_exercises
 (id, session_id, household_id, user_id, exercise_id, template_exercise_id, position,
  name, unit, load, unilateral, role, planned_sets, target, performed_on, performed_at)
SELECT coalesce(x.id, gen_random_uuid()), l.id, l.household_id, l.user_id,
 coalesce((e.value->>'catalogExerciseId')::uuid, x.exercise_id,
   (SELECT c.id FROM exercises c WHERE c.household_id=l.household_id AND c.id=(e.value->>'id')::uuid),
   (SELECT p.exercise_id FROM workout_exercises p WHERE p.household_id=l.household_id AND p.workout_id=l.workout_id AND p.id=(e.value->>'id')::uuid)),
 (e.value->>'id')::uuid, (e.position-1)::integer,
 e.value->>'name', e.value->>'unit', e.value->>'load', (e.value->>'unilateral')::boolean,
 coalesce(l.exercise_roles->>(e.value->>'id'), e.value->>'role', 'workout'),
 (e.value->>'sets')::integer, e.value->>'target',
 coalesce(x.performed_on,l.completed_on), coalesce(x.performed_at,l.completed_at)
FROM workout_logs l
CROSS JOIN LATERAL jsonb_array_elements(l.snapshot->'exercises') WITH ORDINALITY e(value, position)
LEFT JOIN workout_log_exercises w ON w.workout_log_id=l.id AND w.workout_exercise_id=(e.value->>'id')::uuid
LEFT JOIN exercise_logs x ON x.id=w.exercise_log_id;
--> statement-breakpoint
-- Log-only additions have their own frozen definition, never a fake template slot.
INSERT INTO training_session_exercises
 (id, session_id, household_id, user_id, exercise_id, template_exercise_id, position,
  name, unit, load, unilateral, role, planned_sets, target, performed_on, performed_at)
SELECT x.id, l.id, x.household_id, x.user_id, x.exercise_id, NULL,
 w.position,
 x.snapshot->>'name', x.snapshot->>'unit', x.snapshot->>'load', (x.snapshot->>'unilateral')::boolean,
 coalesce(x.snapshot->>'role','workout'), (x.snapshot->>'sets')::integer, x.snapshot->>'target', x.performed_on,x.performed_at
FROM exercise_logs x JOIN workout_log_exercises w ON w.exercise_log_id=x.id
JOIN workout_logs l ON l.id=w.workout_log_id
WHERE NOT EXISTS (SELECT 1 FROM training_session_exercises n WHERE n.id=x.id);
--> statement-breakpoint
INSERT INTO training_session_sets (session_exercise_id, round, amount, right_amount, weight_kg, unit, load, unilateral)
SELECT exercise_log_id, round, amount, right_amount, weight_kg, unit, load, unilateral FROM exercise_log_sets;
--> statement-breakpoint
-- Fail closed before retiring any source table. Compare values, not just counts.
DO $$ BEGIN
 IF EXISTS (
  (SELECT id,household_id,user_id,workout_id,snapshot->>'title',note,completed_on,completed_at,created_at FROM workout_logs
   EXCEPT ALL SELECT id,household_id,user_id,workout_id,name,note,completed_on,completed_at,created_at FROM training_sessions)
  UNION ALL
  (SELECT id,household_id,user_id,workout_id,name,note,completed_on,completed_at,created_at FROM training_sessions
   EXCEPT ALL SELECT id,household_id,user_id,workout_id,snapshot->>'title',note,completed_on,completed_at,created_at FROM workout_logs)
 ) THEN RAISE EXCEPTION 'Training migration: session values changed'; END IF;
 IF EXISTS (
  SELECT 1 FROM exercise_logs x JOIN workout_log_exercises w ON w.exercise_log_id=x.id
  LEFT JOIN training_session_exercises n ON n.id=x.id
  WHERE n.id IS NULL OR n.session_id<>w.workout_log_id OR n.household_id<>x.household_id
   OR n.user_id<>x.user_id OR n.exercise_id<>x.exercise_id
   OR n.performed_on<>x.performed_on OR n.performed_at<>x.performed_at
 ) THEN RAISE EXCEPTION 'Training migration: occurrence identity/ownership/dates changed'; END IF;
 IF EXISTS (
  (SELECT exercise_log_id,round,amount,right_amount,weight_kg,unit,load,unilateral FROM exercise_log_sets
   EXCEPT ALL SELECT session_exercise_id,round,amount,right_amount,weight_kg,unit,load,unilateral FROM training_session_sets)
  UNION ALL
  (SELECT session_exercise_id,round,amount,right_amount,weight_kg,unit,load,unilateral FROM training_session_sets
   EXCEPT ALL SELECT exercise_log_id,round,amount,right_amount,weight_kg,unit,load,unilateral FROM exercise_log_sets)
 ) THEN RAISE EXCEPTION 'Training migration: recorded measurements changed'; END IF;
END $$;
--> statement-breakpoint
CREATE SCHEMA training_archive;
REVOKE ALL ON SCHEMA training_archive FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE source text; BEGIN
 FOREACH source IN ARRAY ARRAY['workout_logs','workout_log_exercises','exercise_logs','exercise_log_sets','workout_log_sets'] LOOP
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='home_hub_zero' AND schemaname='public' AND tablename=source) THEN
   EXECUTE format('ALTER PUBLICATION home_hub_zero DROP TABLE public.%I',source);
  END IF;
  EXECUTE format('ALTER TABLE public.%I SET SCHEMA training_archive',source);
 END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION training_archive.reject_writes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Training archive is read-only'; END $$;
--> statement-breakpoint
DO $$ DECLARE source text; BEGIN
 FOREACH source IN ARRAY ARRAY['workout_logs','workout_log_exercises','exercise_logs','exercise_log_sets','workout_log_sets'] LOOP
  EXECUTE format('CREATE TRIGGER training_archive_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON training_archive.%I FOR EACH STATEMENT EXECUTE FUNCTION training_archive.reject_writes()',source);
 END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE "training_session_exercises" ADD CONSTRAINT "training_exercises_session_fk" FOREIGN KEY ("household_id","user_id","session_id") REFERENCES "public"."training_sessions"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_exercises" ADD CONSTRAINT "training_exercises_catalog_fk" FOREIGN KEY ("household_id","exercise_id") REFERENCES "public"."exercises"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_sets" ADD CONSTRAINT "training_session_sets_session_exercise_id_training_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."training_session_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_workout_fk" FOREIGN KEY ("household_id","workout_id") REFERENCES "public"."workouts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_exercises_template_slot" ON "training_session_exercises" USING btree ("session_id","template_exercise_id") WHERE "training_session_exercises"."template_exercise_id" is not null and "training_session_exercises"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "training_exercises_extra_catalog" ON "training_session_exercises" USING btree ("session_id","exercise_id") WHERE "training_session_exercises"."template_exercise_id" is null and "training_session_exercises"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "training_exercises_latest" ON "training_session_exercises" USING btree ("household_id","user_id","exercise_id","performed_on","performed_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_workout_day" ON "training_sessions" USING btree ("household_id","user_id","workout_id","completed_on") WHERE "training_sessions"."workout_id" is not null and "training_sessions"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_free_day" ON "training_sessions" USING btree ("household_id","user_id","completed_on") WHERE "training_sessions"."workout_id" is null and "training_sessions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "training_sessions_history" ON "training_sessions" USING btree ("household_id","user_id","completed_on","completed_at","id");
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE training_sessions, training_session_exercises, training_session_sets;