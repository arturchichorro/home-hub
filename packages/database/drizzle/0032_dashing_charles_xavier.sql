ALTER TABLE "habits" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_note_length" CHECK ("habits"."note" IS NULL OR length("habits"."note") <= 500);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."habits";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habits" (
  "id", "household_id", "name", "note", "sort_key", "status", "created_at", "updated_at"
);
