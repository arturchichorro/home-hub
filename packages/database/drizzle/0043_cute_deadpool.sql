-- Contract migration: stop API/Zero, back up PostgreSQL, and rebuild the disposable
-- Zero replica before restarting matching clients. No R2 objects are moved/deleted.
LOCK TABLE recipe_images IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"duration_ms" integer,
	"animated" boolean,
	"confirmed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "media_household_id_id" UNIQUE("household_id","id"),
	CONSTRAINT "media_kind" CHECK ("media"."kind" IN ('image', 'video')),
	CONSTRAINT "media_supported_content_type" CHECK ("media"."kind" = 'image' AND "media"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_byte_size_range" CHECK ("media"."byte_size" > 0 AND "media"."byte_size" <= 10485760),
	CONSTRAINT "media_dimensions_range" CHECK ("media"."width" > 0 AND "media"."width" <= 16384 AND "media"."height" > 0 AND "media"."height" <= 16384),
	CONSTRAINT "media_duration" CHECK ("media"."duration_ms" IS NULL OR ("media"."kind" = 'video' AND "media"."duration_ms" > 0)),
	CONSTRAINT "media_animation" CHECK ("media"."animated" IS NULL OR "media"."kind" = 'image')
);
--> statement-breakpoint
CREATE TABLE "recipe_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"cook_log_id" uuid,
	"media_id" uuid NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_media" ADD CONSTRAINT "recipe_media_household_recipe_fk" FOREIGN KEY ("household_id","recipe_id") REFERENCES "public"."recipes"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_media" ADD CONSTRAINT "recipe_media_household_recipe_cook_log_fk" FOREIGN KEY ("household_id","recipe_id","cook_log_id") REFERENCES "public"."recipe_cook_logs"("household_id","recipe_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_media" ADD CONSTRAINT "recipe_media_household_media_fk" FOREIGN KEY ("household_id","media_id") REFERENCES "public"."media"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_media_media_id_idx" ON "recipe_media" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "recipe_media_recipe_id_sort_key_id_idx" ON "recipe_media" USING btree ("recipe_id","sort_key","id") WHERE "recipe_media"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "recipe_media_cook_log_id_sort_key_id_idx" ON "recipe_media" USING btree ("cook_log_id","sort_key","id") WHERE "recipe_media"."deleted_at" is null;
--> statement-breakpoint

-- Keep every original, pending row and tombstone. Asset IDs and legacy recipe
-- attachment IDs initially coincide; future attachments have independent IDs.
INSERT INTO media (id, household_id, kind, object_key, content_type, byte_size,
  width, height, confirmed_at, deleted_at, created_at, updated_at)
SELECT id, household_id, 'image', object_key, content_type, byte_size,
  width, height, confirmed_at, deleted_at, created_at, updated_at
FROM recipe_images;
--> statement-breakpoint
INSERT INTO recipe_media (id, household_id, recipe_id, cook_log_id, media_id,
  sort_key, deleted_at, created_at, updated_at)
SELECT id, household_id, recipe_id, cook_log_id, id,
  sort_key, deleted_at, created_at, updated_at
FROM recipe_images;
--> statement-breakpoint
DO $$
BEGIN
  IF (SELECT count(*) FROM recipe_images) <> (SELECT count(*) FROM media)
    OR (SELECT count(*) FROM recipe_images) <> (SELECT count(*) FROM recipe_media)
    OR EXISTS (
      SELECT id, household_id, recipe_id, cook_log_id, object_key, content_type,
        byte_size, sort_key, confirmed_at, deleted_at, width, height, created_at, updated_at
      FROM recipe_images
      EXCEPT ALL
      SELECT a.id, a.household_id, a.recipe_id, a.cook_log_id, m.object_key, m.content_type,
        m.byte_size, a.sort_key, m.confirmed_at, a.deleted_at, m.width, m.height, a.created_at, a.updated_at
      FROM recipe_media a JOIN media m ON (m.household_id, m.id) = (a.household_id, a.media_id)
    ) OR EXISTS (
      SELECT 1 FROM recipe_images old JOIN media m ON m.id = old.id
      WHERE m.deleted_at IS DISTINCT FROM old.deleted_at
        OR m.created_at IS DISTINCT FROM old.created_at
        OR m.updated_at IS DISTINCT FROM old.updated_at
        OR m.kind <> 'image' OR m.duration_ms IS NOT NULL OR m.animated IS NOT NULL
    )
  THEN RAISE EXCEPTION 'Shared media migration did not preserve recipe image data';
  END IF;
END $$;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero DROP TABLE recipe_images;
--> statement-breakpoint
DROP TABLE recipe_images;
--> statement-breakpoint
-- Object keys remain server-only. Publication is an allowlist, not authorization.
ALTER PUBLICATION home_hub_zero ADD TABLE media (
  id, household_id, kind, content_type, byte_size, width, height, duration_ms,
  animated, confirmed_at, deleted_at, created_at, updated_at
);
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE recipe_media;
