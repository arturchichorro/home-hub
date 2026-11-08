CREATE TABLE "training_session_exercises" (
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"exercise_log_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "training_session_exercises_session_id_exercise_id_pk" PRIMARY KEY("session_id","exercise_id"),
	CONSTRAINT "training_session_exercises_exercise_log_id_unique" UNIQUE("exercise_log_id")
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"removed_exercise_log_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_on" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "training_sessions_author_id" UNIQUE("household_id","user_id","id"),
	CONSTRAINT "training_sessions_name" CHECK (char_length("training_sessions"."name") <= 150)
);
--> statement-breakpoint
ALTER TABLE "training_session_exercises" ADD CONSTRAINT "training_session_exercises_household_id_user_id_session_id_training_sessions_household_id_user_id_id_fk" FOREIGN KEY ("household_id","user_id","session_id") REFERENCES "public"."training_sessions"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_exercises" ADD CONSTRAINT "training_session_exercises_household_id_user_id_exercise_log_id_exercise_logs_household_id_user_id_id_fk" FOREIGN KEY ("household_id","user_id","exercise_log_id") REFERENCES "public"."exercise_logs"("household_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session_exercises" ADD CONSTRAINT "training_session_exercises_household_id_exercise_id_exercises_household_id_id_fk" FOREIGN KEY ("household_id","exercise_id") REFERENCES "public"."exercises"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "training_sessions_one_per_day" ON "training_sessions" USING btree ("household_id","user_id","completed_on") WHERE "training_sessions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "training_sessions_history" ON "training_sessions" USING btree ("household_id","user_id","completed_on","completed_at","id");
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE training_sessions, training_session_exercises;