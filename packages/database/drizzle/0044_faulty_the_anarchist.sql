CREATE TABLE "exercise_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_household_exercise_fk" FOREIGN KEY ("household_id","exercise_id") REFERENCES "public"."exercises"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_media" ADD CONSTRAINT "exercise_media_household_media_fk" FOREIGN KEY ("household_id","media_id") REFERENCES "public"."media"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercise_media_exercise_sort_id" ON "exercise_media" USING btree ("household_id","exercise_id","sort_key","id") WHERE "exercise_media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "exercise_media_media_id" ON "exercise_media" USING btree ("media_id");
--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."exercise_media";