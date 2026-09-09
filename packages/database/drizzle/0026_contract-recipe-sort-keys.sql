DROP TRIGGER "recipe_images_sync_order_columns" ON "recipe_images";--> statement-breakpoint
DROP TRIGGER "recipe_ingredients_sync_order_columns" ON "recipe_ingredients";--> statement-breakpoint
DROP FUNCTION "sync_recipe_order_columns"();--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_images";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_ingredients";--> statement-breakpoint
DROP INDEX "recipe_images_recipe_id_position_id_idx";--> statement-breakpoint
DROP INDEX "recipe_images_cook_log_id_position_id_idx";--> statement-breakpoint
DROP INDEX "recipe_ingredients_recipe_id_position_id_idx";--> statement-breakpoint
ALTER TABLE "recipe_images" DROP COLUMN "position";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" DROP COLUMN "position";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_images" (
  "id",
  "household_id",
  "recipe_id",
  "cook_log_id",
  "content_type",
  "byte_size",
  "sort_key",
  "confirmed_at",
  "width",
  "height",
  "created_at",
  "updated_at"
);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_ingredients" (
  "id",
  "household_id",
  "recipe_id",
  "name",
  "amount",
  "note",
  "sort_key",
  "created_at",
  "updated_at"
);
