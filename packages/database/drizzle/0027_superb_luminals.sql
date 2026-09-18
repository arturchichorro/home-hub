DROP INDEX "recipe_cook_logs_recipe_id_cooked_at_id_idx";--> statement-breakpoint
DROP INDEX "recipe_images_recipe_id_sort_key_id_idx";--> statement-breakpoint
DROP INDEX "recipe_images_cook_log_id_sort_key_id_idx";--> statement-breakpoint
DROP INDEX "recipe_ingredients_recipe_id_sort_key_id_idx";--> statement-breakpoint
ALTER TABLE "recipe_cook_logs" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipe_images" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "recipe_cook_logs_recipe_id_cooked_at_id_idx" ON "recipe_cook_logs" USING btree ("recipe_id","cooked_at","id") WHERE "recipe_cook_logs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipe_images_recipe_id_sort_key_id_idx" ON "recipe_images" USING btree ("recipe_id","sort_key","id") WHERE "recipe_images"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipe_images_cook_log_id_sort_key_id_idx" ON "recipe_images" USING btree ("cook_log_id","sort_key","id") WHERE "recipe_images"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_sort_key_id_idx" ON "recipe_ingredients" USING btree ("recipe_id","sort_key","id") WHERE "recipe_ingredients"."deleted_at" is null;