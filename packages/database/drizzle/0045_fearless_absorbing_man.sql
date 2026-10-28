-- Preserve historical-only identities as tombstones, never expose their names.
-- Primary keys, historical FKs, measurements, snapshots and media are unchanged.
DROP INDEX "exercises_household_name";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "sort_key" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "exercises" SET "deleted_at" = coalesce("updated_at","created_at",now()) WHERE "archived";--> statement-breakpoint
WITH ordered AS (
 SELECT id, ((count(*) OVER (PARTITION BY household_id) - row_number() OVER (
   PARTITION BY household_id ORDER BY normalized_name,id
 ) + 1) * 1024)::integer AS sort_key FROM exercises WHERE deleted_at IS NULL
)
UPDATE exercises SET sort_key=ordered.sort_key FROM ordered WHERE exercises.id=ordered.id;--> statement-breakpoint
CREATE INDEX "exercises_household_sort_key_id" ON "exercises" USING btree ("household_id","sort_key","id");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_household_name" ON "exercises" USING btree ("household_id","normalized_name") WHERE "exercises"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "exercises" DROP COLUMN "archived";
