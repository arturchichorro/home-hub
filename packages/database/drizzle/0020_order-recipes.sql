ALTER TABLE "recipes" ADD COLUMN "sort_key" integer;--> statement-breakpoint
-- Preserve the current alphabetical display order when assigning initial keys.
WITH ranked_recipes AS (
  SELECT
    "id",
    (
      row_number() OVER (
        PARTITION BY "household_id"
        ORDER BY "title" DESC, "id" DESC
      ) * 1024
    )::integer AS "sort_key"
  FROM "recipes"
)
UPDATE "recipes"
SET "sort_key" = ranked_recipes."sort_key"
FROM ranked_recipes
WHERE "recipes"."id" = ranked_recipes."id";--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "sort_key" SET NOT NULL;--> statement-breakpoint
-- Recipes is published with an explicit column list, so expose sort_key.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."recipes";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."recipes" (
  "id",
  "household_id",
  "title",
  "description",
  "sort_key",
  "deleted_at",
  "created_at",
  "updated_at"
);--> statement-breakpoint
CREATE INDEX "recipes_household_id_sort_key_id_idx" ON "recipes" USING btree ("household_id","sort_key","id") WHERE "recipes"."deleted_at" is null;
