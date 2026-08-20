ALTER TABLE "recipe_ingredients" RENAME COLUMN "quantity" TO "amount";--> statement-breakpoint
UPDATE "recipe_ingredients"
SET "amount" = NULLIF(
	concat_ws(
		' ',
		NULLIF(btrim("amount"), ''),
		NULLIF(btrim("unit"), '')
	),
	''
);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "recipe_ingredients";--> statement-breakpoint
ALTER TABLE "recipe_ingredients" DROP COLUMN "unit";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero"
ADD TABLE "recipe_ingredients" (
	"id",
	"household_id",
	"recipe_id",
	"name",
	"amount",
	"note",
	"position",
	"created_at",
	"updated_at"
);
