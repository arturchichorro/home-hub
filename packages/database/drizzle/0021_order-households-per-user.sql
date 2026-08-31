DROP INDEX "household_members_user_id_idx";--> statement-breakpoint
ALTER TABLE "household_members" ADD COLUMN "sort_key" integer;--> statement-breakpoint
-- Preserve each user's current alphabetical sidebar order.
WITH ranked_memberships AS (
  SELECT
    "household_members"."id",
    (
      row_number() OVER (
        PARTITION BY "household_members"."user_id"
        ORDER BY "households"."name" DESC, "households"."id" DESC
      ) * 1024
    )::integer AS "sort_key"
  FROM "household_members"
  INNER JOIN "households"
    ON "households"."id" = "household_members"."household_id"
)
UPDATE "household_members"
SET "sort_key" = ranked_memberships."sort_key"
FROM ranked_memberships
WHERE "household_members"."id" = ranked_memberships."id";--> statement-breakpoint
ALTER TABLE "household_members" ALTER COLUMN "sort_key" SET NOT NULL;--> statement-breakpoint
-- Household members is published with an explicit column list.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."household_members";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."household_members" (
  "id",
  "household_id",
  "user_id",
  "role",
  "sort_key",
  "created_at",
  "updated_at"
);--> statement-breakpoint
CREATE INDEX "household_members_user_id_sort_key_id_idx" ON "household_members" USING btree ("user_id","sort_key","id");
