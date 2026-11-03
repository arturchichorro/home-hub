CREATE TABLE "list_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_supported_content_type";--> statement-breakpoint
ALTER TABLE "media" DROP CONSTRAINT "media_byte_size_range";--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "kind" text DEFAULT 'checklist' NOT NULL;--> statement-breakpoint
ALTER TABLE "lists" ADD COLUMN "media_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "video_version" text;--> statement-breakpoint
ALTER TABLE "list_media" ADD CONSTRAINT "list_media_list_fk" FOREIGN KEY ("household_id","list_id") REFERENCES "public"."lists"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_media" ADD CONSTRAINT "list_media_asset_fk" FOREIGN KEY ("household_id","media_id") REFERENCES "public"."media"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_media_order" ON "list_media" USING btree ("household_id","list_id","sort_key","id") WHERE "list_media"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_kind" CHECK ("lists"."kind" IN ('checklist', 'moodboard'));--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_media_count" CHECK ("lists"."media_count" >= 0);--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_confirmed_video" CHECK ("media"."kind" != 'video' OR "media"."confirmed_at" IS NULL OR ("media"."video_version" IS NOT NULL AND "media"."duration_ms" IS NOT NULL AND "media"."duration_ms" BETWEEN 1 AND 600000 AND "media"."width" <= 4096 AND "media"."height" <= 4096));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_video_version" CHECK ("media"."video_version" IS NULL OR ("media"."kind" = 'video' AND "media"."video_version" ~ '^[a-f0-9]{64}$'));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_supported_content_type" CHECK (("media"."kind" = 'image' AND "media"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')) OR ("media"."kind" = 'video' AND "media"."content_type" IN ('video/mp4', 'video/webm')));--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_byte_size_range" CHECK ("media"."byte_size" > 0 AND (("media"."kind" = 'image' AND "media"."byte_size" <= 10485760) OR ("media"."kind" = 'video' AND "media"."byte_size" <= 104857600)));--> statement-breakpoint
-- Keep explicit column allowlists; adding a PostgreSQL column alone does not publish it.
ALTER PUBLICATION home_hub_zero DROP TABLE lists, media;--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE
 lists (id,household_id,name,normalized_name,sort_key,deleted_at,created_at,updated_at,kind,media_count),
 media (id,household_id,kind,content_type,byte_size,width,height,duration_ms,animated,confirmed_at,deleted_at,created_at,updated_at,video_version),
 list_media;
