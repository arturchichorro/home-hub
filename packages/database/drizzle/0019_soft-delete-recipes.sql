ALTER TABLE "recipes" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- The publication uses an explicit column list, so re-register Recipes to
-- expose deleted_at to Zero.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipes";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipes" (
  "id",
  "household_id",
  "title",
  "description",
  "deleted_at",
  "created_at",
  "updated_at"
);
