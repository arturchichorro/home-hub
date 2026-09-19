-- These tables use explicit publication column lists. Re-register them so
-- Zero receives the soft-deletion columns introduced by migration 0027.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_cook_logs";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_cook_logs" (
  "id",
  "household_id",
  "recipe_id",
  "cooked_at",
  "comment",
  "deleted_at",
  "created_at",
  "updated_at"
);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_images";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_images" (
  "id",
  "household_id",
  "recipe_id",
  "cook_log_id",
  "content_type",
  "byte_size",
  "sort_key",
  "confirmed_at",
  "deleted_at",
  "width",
  "height",
  "created_at",
  "updated_at"
);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_ingredients";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_ingredients" (
  "id",
  "household_id",
  "recipe_id",
  "name",
  "amount",
  "note",
  "sort_key",
  "deleted_at",
  "created_at",
  "updated_at"
);
