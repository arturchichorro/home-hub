CREATE TABLE "workout_cycles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"started_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_cycles_scope_id" UNIQUE("household_id","user_id","id")
);
--> statement-breakpoint
CREATE TABLE "workout_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workout_plans_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "workout_plan_title_length" CHECK (length(trim("workout_plans"."title")) between 1 and 150)
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"low_energy" boolean NOT NULL,
	"status" text NOT NULL,
	"completed_on" text,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "workout_session_status" CHECK ("workout_sessions"."status" in ('active', 'completed', 'abandoned')),
	CONSTRAINT "workout_session_completion" CHECK (("workout_sessions"."status" = 'completed') = ("workout_sessions"."completed_at" is not null and "workout_sessions"."completed_on" is not null)),
	CONSTRAINT "workout_session_note_length" CHECK (length("workout_sessions"."note") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"values" jsonb NOT NULL,
	CONSTRAINT "workout_sets_session_id_exercise_id_round_pk" PRIMARY KEY("session_id","exercise_id","round"),
	CONSTRAINT "workout_set_round" CHECK ("workout_sets"."round" between 1 and 10)
);
--> statement-breakpoint
ALTER TABLE "workout_cycles" ADD CONSTRAINT "workout_cycles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_cycles" ADD CONSTRAINT "workout_cycles_household_id_plan_id_workout_plans_household_id_id_fk" FOREIGN KEY ("household_id","plan_id") REFERENCES "public"."workout_plans"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_plans" ADD CONSTRAINT "workout_plans_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_household_id_user_id_cycle_id_workout_cycles_household_id_user_id_id_fk" FOREIGN KEY ("household_id","user_id","cycle_id") REFERENCES "public"."workout_cycles"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_cycles_owner" ON "workout_cycles" USING btree ("household_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "workout_sessions_one_active" ON "workout_sessions" USING btree ("household_id","user_id") WHERE "workout_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "workout_sessions_owner_history" ON "workout_sessions" USING btree ("household_id","user_id","created_at");--> statement-breakpoint
INSERT INTO "household_module_settings" ("household_id", "module_key", "enabled")
SELECT "id", 'workouts', false FROM "households"
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."workout_plans", "public"."workout_cycles", "public"."workout_sessions", "public"."workout_sets";