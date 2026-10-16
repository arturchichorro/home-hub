-- Breaking contract change: stop the old API/Zero before this migration and
-- restart with the new application/schema afterward. See docs/habits/README.md.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."habits";--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
-- Preserve archive state before discarding the unused archive timestamp.
UPDATE "habits" SET "status" = 'archived' WHERE "archived_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_status_allowed" CHECK ("habits"."status" IN ('active', 'archived'));--> statement-breakpoint
ALTER TABLE "habits" DROP CONSTRAINT "habits_created_on_date";--> statement-breakpoint
DROP INDEX "habits_household_id_archived_at_idx";--> statement-breakpoint
DROP INDEX "habits_household_sort_key_idx";--> statement-breakpoint
ALTER TABLE "habits" DROP COLUMN "created_on";--> statement-breakpoint
ALTER TABLE "habits" DROP COLUMN "archived_at";--> statement-breakpoint
CREATE INDEX "habits_household_id_status_idx" ON "habits" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "habits_household_sort_key_idx" ON "habits" USING btree ("household_id","sort_key","id") WHERE "habits"."status" = 'active';--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habits" (
  "id", "household_id", "name", "sort_key", "status", "created_at", "updated_at"
);
