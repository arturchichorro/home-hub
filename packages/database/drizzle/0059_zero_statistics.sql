CREATE TABLE "exercise_statistics" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"stats" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_statistics_household_id_user_id_exercise_id_pk" PRIMARY KEY("household_id","user_id","exercise_id"),
	CONSTRAINT "exercise_statistics_object" CHECK (jsonb_typeof("exercise_statistics"."stats") = 'object')
);
--> statement-breakpoint
CREATE TABLE "habit_weekly_statistics" (
	"household_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"week_on" text NOT NULL,
	"completed_mask" integer NOT NULL,
	"completed_days" integer NOT NULL,
	"last_on" text NOT NULL,
	"run_length" integer NOT NULL,
	"best_weeks" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_weekly_statistics_household_id_habit_id_user_id_week_on_pk" PRIMARY KEY("household_id","habit_id","user_id","week_on"),
	CONSTRAINT "habit_weekly_statistics_mask" CHECK ("habit_weekly_statistics"."completed_mask" between 1 and 127),
	CONSTRAINT "habit_weekly_statistics_counts" CHECK ("habit_weekly_statistics"."completed_days" > 0 and "habit_weekly_statistics"."run_length" > 0 and "habit_weekly_statistics"."best_weeks" >= "habit_weekly_statistics"."run_length"),
	CONSTRAINT "habit_weekly_statistics_week" CHECK ("habit_weekly_statistics"."week_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and extract(isodow from "habit_weekly_statistics"."week_on"::date) = 1)
);
--> statement-breakpoint
ALTER TABLE "exercise_statistics" ADD CONSTRAINT "exercise_statistics_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_statistics" ADD CONSTRAINT "exercise_statistics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_statistics" ADD CONSTRAINT "exercise_statistics_household_id_exercise_id_exercises_household_id_id_fk" FOREIGN KEY ("household_id","exercise_id") REFERENCES "public"."exercises"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_weekly_statistics" ADD CONSTRAINT "habit_weekly_statistics_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_weekly_statistics" ADD CONSTRAINT "habit_weekly_statistics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_weekly_statistics" ADD CONSTRAINT "habit_weekly_statistics_household_id_habit_id_habits_household_id_id_fk" FOREIGN KEY ("household_id","habit_id") REFERENCES "public"."habits"("household_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- One canonical aggregate implementation serves both backfill and Zero writes.
-- Invoker security: callers are the application's already-authorized transaction.
CREATE FUNCTION public.refresh_exercise_statistics(p_household uuid, p_user uuid)
RETURNS void LANGUAGE sql SET search_path = public AS $$
  WITH keys AS (
    SELECT DISTINCT e.exercise_id FROM training_session_exercises e
      JOIN exercises x ON x.id=e.exercise_id AND x.household_id=e.household_id
      WHERE e.household_id=p_household AND e.user_id=p_user
    UNION SELECT exercise_id FROM exercise_statistics
      WHERE household_id=p_household AND user_id=p_user
  ), scoped AS MATERIALIZED (
    SELECT s.*, e.exercise_id, e.session_id, e.performed_on
    FROM training_session_sets s
    JOIN training_session_exercises e ON e.id=s.session_exercise_id
    JOIN training_sessions t ON t.id=e.session_id AND t.household_id=e.household_id AND t.user_id=e.user_id
    WHERE e.household_id=p_household AND e.user_id=p_user
      AND e.deleted_at IS NULL AND t.deleted_at IS NULL
  ), records AS (
    SELECT exercise_id, unit, load, unilateral, max(weight_kg) AS weight
    FROM scoped WHERE weight_kg IS NOT NULL AND load <> 'bodyweight'
    GROUP BY exercise_id, unit, load, unilateral
  ), record_json AS (
    SELECT exercise_id, jsonb_agg(jsonb_build_object(
      'unit',unit,'load',load,'unilateral',unilateral,'weightKg',weight
    ) ORDER BY unit,load,unilateral) AS records FROM records GROUP BY exercise_id
  )
  INSERT INTO exercise_statistics(household_id,user_id,exercise_id,stats)
  SELECT p_household,p_user,k.exercise_id,jsonb_build_object(
    'sessions',count(DISTINCT s.session_id),'sets',count(s.session_exercise_id),'lastOn',max(s.performed_on),
    'reps',jsonb_build_object(
      'total',coalesce(sum(amount+CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END) FILTER (WHERE unit='reps'),0),
      'left',coalesce(sum(amount) FILTER (WHERE unit='reps' AND unilateral),0),
      'right',coalesce(sum(coalesce(right_amount,amount)) FILTER (WHERE unit='reps' AND unilateral),0),
      'sets',count(*) FILTER (WHERE unit='reps'),
      'unilateralSets',count(*) FILTER (WHERE unit='reps' AND unilateral)),
    'seconds',jsonb_build_object(
      'total',coalesce(sum(amount+CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END) FILTER (WHERE unit='seconds'),0),
      'left',coalesce(sum(amount) FILTER (WHERE unit='seconds' AND unilateral),0),
      'right',coalesce(sum(coalesce(right_amount,amount)) FILTER (WHERE unit='seconds' AND unilateral),0),
      'sets',count(*) FILTER (WHERE unit='seconds'),
      'unilateralSets',count(*) FILTER (WHERE unit='seconds' AND unilateral)),
    'volumeKg',sum(weight_kg*CASE WHEN load='per-hand' THEN 2 ELSE 1 END*
      (amount+CASE WHEN unilateral THEN coalesce(right_amount,amount) ELSE 0 END))
      FILTER (WHERE unit='reps' AND load <> 'bodyweight' AND weight_kg IS NOT NULL),
    'unmeasuredSets',count(*) FILTER (WHERE unit='reps' AND load <> 'bodyweight' AND weight_kg IS NULL),
    'records',coalesce(r.records,'[]'::jsonb)
  )
  FROM keys k LEFT JOIN scoped s ON s.exercise_id=k.exercise_id
    LEFT JOIN record_json r ON r.exercise_id=k.exercise_id
  GROUP BY k.exercise_id,r.records
  ON CONFLICT(household_id,user_id,exercise_id) DO UPDATE
    SET stats=excluded.stats,updated_at=now()
    WHERE exercise_statistics.stats IS DISTINCT FROM excluded.stats;
$$;
--> statement-breakpoint
-- Seven bits describe the week's days; prefix counters preserve exact lifetime
-- counts/streaks while readers subscribe to at most six metadata-only rows.
CREATE FUNCTION public.refresh_habit_weekly_statistics(
  p_household uuid, p_user uuid DEFAULT NULL, p_habits uuid[] DEFAULT NULL
) RETURNS void LANGUAGE sql SET search_path = public AS $$
  WITH weeks AS (
    SELECT household_id,habit_id,user_id,
      entry_on::date-(extract(isodow from entry_on::date)::integer-1) AS week,
      bit_or(1 << (extract(isodow from entry_on::date)::integer-1)) AS mask,
      count(*)::integer AS days,max(entry_on) AS last_on
    FROM habit_entries WHERE household_id=p_household
      AND (p_user IS NULL OR user_id=p_user)
      AND (p_habits IS NULL OR habit_id=ANY(p_habits))
      AND (completed OR workout_completed)
    GROUP BY household_id,habit_id,user_id,week
  ), numbered AS (
    SELECT *,week-(row_number() OVER (
      PARTITION BY household_id,habit_id,user_id ORDER BY week
    ))::integer*7 AS run_group FROM weeks
  ), runs AS (
    SELECT *,row_number() OVER (
      PARTITION BY household_id,habit_id,user_id,run_group ORDER BY week
    )::integer AS run_length,
    (sum(days) OVER (
      PARTITION BY household_id,habit_id,user_id ORDER BY week
    ))::integer AS completed_days FROM numbered
  ), rolled AS MATERIALIZED (
    SELECT *,max(run_length) OVER (
      PARTITION BY household_id,habit_id,user_id ORDER BY week
    ) AS best_weeks FROM runs
  ), removed AS (
    DELETE FROM habit_weekly_statistics old WHERE old.household_id=p_household
      AND (p_user IS NULL OR old.user_id=p_user)
      AND (p_habits IS NULL OR old.habit_id=ANY(p_habits))
      AND NOT EXISTS (SELECT 1 FROM rolled r WHERE r.habit_id=old.habit_id
        AND r.user_id=old.user_id AND r.week::text=old.week_on)
  )
  INSERT INTO habit_weekly_statistics(
    household_id,habit_id,user_id,week_on,completed_mask,completed_days,last_on,run_length,best_weeks
  )
  SELECT household_id,habit_id,user_id,week::text,mask,completed_days,last_on,run_length,best_weeks FROM rolled
  ON CONFLICT(household_id,habit_id,user_id,week_on) DO UPDATE SET
    completed_mask=excluded.completed_mask,completed_days=excluded.completed_days,
    last_on=excluded.last_on,run_length=excluded.run_length,best_weeks=excluded.best_weeks,updated_at=now()
    WHERE (habit_weekly_statistics.completed_mask,habit_weekly_statistics.completed_days,
      habit_weekly_statistics.last_on,habit_weekly_statistics.run_length,habit_weekly_statistics.best_weeks)
    IS DISTINCT FROM (excluded.completed_mask,excluded.completed_days,excluded.last_on,excluded.run_length,excluded.best_weeks);
$$;
--> statement-breakpoint
SELECT public.refresh_exercise_statistics(household_id,user_id)
  FROM (SELECT DISTINCT household_id,user_id FROM training_session_exercises) authors;
--> statement-breakpoint
SELECT public.refresh_habit_weekly_statistics(id) FROM households;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE exercise_statistics,habit_weekly_statistics;
