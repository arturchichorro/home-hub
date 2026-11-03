CREATE TABLE "habit_workout_links" (
	"household_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"workout_id" uuid NOT NULL,
	CONSTRAINT "habit_workout_links_habit_id_workout_id_pk" PRIMARY KEY("habit_id","workout_id")
);
--> statement-breakpoint
ALTER TABLE "habit_entries" ADD COLUMN "workout_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "workout_mode" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_workout_links" ADD CONSTRAINT "habit_workout_links_habit_fk" FOREIGN KEY ("household_id","habit_id") REFERENCES "public"."habits"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_workout_links" ADD CONSTRAINT "habit_workout_links_workout_fk" FOREIGN KEY ("household_id","workout_id") REFERENCES "public"."workouts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_workout_links_workout" ON "habit_workout_links" USING btree ("household_id","workout_id","habit_id");--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_workout_mode" CHECK ("habits"."workout_mode" IN ('none', 'any', 'selected'));--> statement-breakpoint
-- These existing tables have explicit publication column lists. Extend them
-- inside this migration transaction, preserving the private-column boundary.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "habits", "habit_entries";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE
  "habits" ("id", "household_id", "name", "created_at", "updated_at", "sort_key", "status", "note", "workout_mode"),
  "habit_entries" ("household_id", "habit_id", "user_id", "entry_on", "created_at", "updated_at", "completed", "note", "workout_completed"),
  "habit_workout_links";