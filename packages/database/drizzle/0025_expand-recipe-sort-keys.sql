ALTER TABLE "recipe_images" DROP CONSTRAINT "recipe_images_position_nonnegative";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" DROP CONSTRAINT "recipe_ingredients_position_nonnegative";--> statement-breakpoint
ALTER TABLE "recipe_images" ADD COLUMN "sort_key" integer;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD COLUMN "sort_key" integer;--> statement-breakpoint
-- Preserve the current ascending (position, id) order while creating sparse,
-- descending keys. Keep position as the inverse compatibility representation
-- so the old and new application versions render the same order.
WITH ranked_images AS (
  SELECT
    "id",
    (
      row_number() OVER (
        PARTITION BY "recipe_id"
        ORDER BY "position" DESC, "id" DESC
      ) * 1024
    )::integer AS "sort_key"
  FROM "recipe_images"
)
UPDATE "recipe_images"
SET
  "sort_key" = ranked_images."sort_key",
  "position" = -ranked_images."sort_key"
FROM ranked_images
WHERE "recipe_images"."id" = ranked_images."id";--> statement-breakpoint
WITH ranked_ingredients AS (
  SELECT
    "id",
    (
      row_number() OVER (
        PARTITION BY "recipe_id"
        ORDER BY "position" DESC, "id" DESC
      ) * 1024
    )::integer AS "sort_key"
  FROM "recipe_ingredients"
)
UPDATE "recipe_ingredients"
SET
  "sort_key" = ranked_ingredients."sort_key",
  "position" = -ranked_ingredients."sort_key"
FROM ranked_ingredients
WHERE "recipe_ingredients"."id" = ranked_ingredients."id";--> statement-breakpoint
ALTER TABLE "recipe_images" ALTER COLUMN "sort_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ALTER COLUMN "sort_key" SET NOT NULL;--> statement-breakpoint
-- During the expand/contract window, old code writes position and new code
-- writes sort_key. Mirror whichever representation changed so deployments and
-- code-only rollbacks remain compatible.
CREATE FUNCTION "sync_recipe_order_columns"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."sort_key" IS NULL THEN
      NEW."sort_key" := -NEW."position";
    ELSIF NEW."position" IS NULL THEN
      NEW."position" := -NEW."sort_key";
    END IF;
  ELSIF NEW."sort_key" IS DISTINCT FROM OLD."sort_key"
    AND NEW."position" IS NOT DISTINCT FROM OLD."position" THEN
    NEW."position" := -NEW."sort_key";
  ELSIF NEW."position" IS DISTINCT FROM OLD."position"
    AND NEW."sort_key" IS NOT DISTINCT FROM OLD."sort_key" THEN
    NEW."sort_key" := -NEW."position";
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "recipe_images_sync_order_columns"
BEFORE INSERT OR UPDATE OF "position", "sort_key" ON "recipe_images"
FOR EACH ROW EXECUTE FUNCTION "sync_recipe_order_columns"();--> statement-breakpoint
CREATE TRIGGER "recipe_ingredients_sync_order_columns"
BEFORE INSERT OR UPDATE OF "position", "sort_key" ON "recipe_ingredients"
FOR EACH ROW EXECUTE FUNCTION "sync_recipe_order_columns"();--> statement-breakpoint
-- Both old and new Zero schemas must remain usable during this release.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipe_images";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipe_images" (
  "id",
  "household_id",
  "recipe_id",
  "cook_log_id",
  "content_type",
  "byte_size",
  "position",
  "sort_key",
  "confirmed_at",
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
  "position",
  "sort_key",
  "created_at",
  "updated_at"
);--> statement-breakpoint
CREATE INDEX "recipe_images_recipe_id_sort_key_id_idx" ON "recipe_images" USING btree ("recipe_id","sort_key","id");--> statement-breakpoint
CREATE INDEX "recipe_images_cook_log_id_sort_key_id_idx" ON "recipe_images" USING btree ("cook_log_id","sort_key","id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_sort_key_id_idx" ON "recipe_ingredients" USING btree ("recipe_id","sort_key","id");
