ALTER TABLE "shopping_items" ADD COLUMN "sort_key" integer;--> statement-breakpoint
WITH ranked_items AS (
	SELECT
		"id",
		(
			row_number() OVER (
				PARTITION BY "household_id", "status"
				ORDER BY "created_at" ASC, "id" DESC
			) * 1024
		)::integer AS "sort_key"
	FROM "shopping_items"
)
UPDATE "shopping_items"
SET "sort_key" = ranked_items."sort_key"
FROM ranked_items
WHERE "shopping_items"."id" = ranked_items."id";--> statement-breakpoint
ALTER TABLE "shopping_items" ALTER COLUMN "sort_key" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "shopping_items_household_id_status_sort_key_id_idx" ON "shopping_items" USING btree ("household_id","status","sort_key","id");--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "shopping_items";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero"
ADD TABLE "shopping_items" (
	"id",
	"household_id",
	"name",
	"normalized_name",
	"status",
	"sort_key",
	"created_at",
	"updated_at"
);
