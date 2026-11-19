CREATE TABLE "calendar_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_media" ADD CONSTRAINT "calendar_media_household_item_fk" FOREIGN KEY ("household_id","item_id") REFERENCES "public"."calendar_items"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_media" ADD CONSTRAINT "calendar_media_household_media_fk" FOREIGN KEY ("household_id","media_id") REFERENCES "public"."media"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_media_item_sort_id" ON "calendar_media" USING btree ("household_id","item_id","sort_key","id") WHERE "calendar_media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "calendar_media_media_id" ON "calendar_media" USING btree ("media_id");
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE calendar_media;