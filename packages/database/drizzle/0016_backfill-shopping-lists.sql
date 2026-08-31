-- Initial backfill only: deployment compatibility for ongoing Shopping writes
-- must be in place before this migration is released to production.
-- Include every existing household, even those without shopping items.
INSERT INTO "public"."lists" (
	"id",
	"household_id",
	"name",
	"normalized_name",
	"sort_key"
)
SELECT
	gen_random_uuid(),
	"household"."id",
	'Shopping',
	'shopping',
	1024
FROM "public"."households" AS "household";
--> statement-breakpoint
-- Preserve item identities and history; leave the source rows untouched.
INSERT INTO "public"."list_items" (
	"id",
	"household_id",
	"list_id",
	"name",
	"normalized_name",
	"status",
	"sort_key",
	"created_at",
	"updated_at"
)
SELECT
	"item"."id",
	"item"."household_id",
	"list"."id",
	"item"."name",
	"item"."normalized_name",
	"item"."status"::text::"public"."list_item_status",
	"item"."sort_key",
	"item"."created_at",
	"item"."updated_at"
FROM "public"."shopping_items" AS "item"
INNER JOIN "public"."lists" AS "list"
	ON "list"."household_id" = "item"."household_id"
	AND "list"."normalized_name" = 'shopping';
