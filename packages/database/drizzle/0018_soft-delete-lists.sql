DROP INDEX "lists_household_id_normalized_name_idx";--> statement-breakpoint
DROP INDEX "lists_household_id_sort_key_id_idx";--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- The publication uses an explicit column list, so re-register Lists to expose
-- deleted_at to Zero. This matches the established column-change migration.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."lists";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."lists" (
  "id",
  "household_id",
  "name",
  "normalized_name",
  "sort_key",
  "deleted_at",
  "created_at",
  "updated_at"
);--> statement-breakpoint
CREATE UNIQUE INDEX "lists_household_id_normalized_name_idx" ON "lists" USING btree ("household_id","normalized_name") WHERE "lists"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "lists_household_id_sort_key_id_idx" ON "lists" USING btree ("household_id","sort_key","id") WHERE "lists"."deleted_at" is null;
