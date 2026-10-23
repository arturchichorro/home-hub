-- Maintenance cutover: the old API/Zero schema must be stopped before renaming.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."habit_completions";--> statement-breakpoint
ALTER TABLE "habit_completions" RENAME TO "habit_entries";--> statement-breakpoint
ALTER TABLE "habit_entries" RENAME COLUMN "completed_on" TO "entry_on";--> statement-breakpoint
ALTER TABLE "habit_entries" RENAME CONSTRAINT "habit_completions_habit_id_user_id_completed_on_pk" TO "habit_entries_habit_id_user_id_entry_on_pk";--> statement-breakpoint
ALTER TABLE "habit_entries" RENAME CONSTRAINT "habit_completions_user_id_users_id_fk" TO "habit_entries_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "habit_entries" RENAME CONSTRAINT "habit_completions_household_habit_fk" TO "habit_entries_household_habit_fk";--> statement-breakpoint
ALTER TABLE "habit_entries" RENAME CONSTRAINT "habit_completions_completed_on_date" TO "habit_entries_entry_on_date";--> statement-breakpoint
ALTER INDEX "habit_completions_household_id_date_idx" RENAME TO "habit_entries_household_id_date_idx";--> statement-breakpoint
-- Every existing row represented a completed day. Preserve it as completed.
ALTER TABLE "habit_entries" ADD COLUMN "completed" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_entries" ALTER COLUMN "completed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_note_length" CHECK ("note" IS NULL OR length("note") <= 500);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habit_entries" (
  "household_id", "habit_id", "user_id", "entry_on", "completed", "note", "created_at", "updated_at"
);
