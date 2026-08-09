ALTER TABLE "recipe_cook_logs" ADD CONSTRAINT "recipe_cook_logs_household_recipe_id_unique" UNIQUE("household_id","recipe_id","id");--> statement-breakpoint
CREATE TABLE "recipe_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"cook_log_id" uuid,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"position" integer NOT NULL,
	"confirmed_at" timestamp with time zone,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_images_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "recipe_images_content_type_allowed" CHECK ("recipe_images"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "recipe_images_byte_size_range" CHECK ("recipe_images"."byte_size" > 0 AND "recipe_images"."byte_size" <= 10485760),
	CONSTRAINT "recipe_images_position_nonnegative" CHECK ("recipe_images"."position" >= 0),
	CONSTRAINT "recipe_images_dimensions_range" CHECK ("recipe_images"."width" > 0 AND "recipe_images"."width" <= 16384 AND "recipe_images"."height" > 0 AND "recipe_images"."height" <= 16384)
);
--> statement-breakpoint
ALTER TABLE "recipe_images" ADD CONSTRAINT "recipe_images_household_recipe_fk" FOREIGN KEY ("household_id","recipe_id") REFERENCES "public"."recipes"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_images" ADD CONSTRAINT "recipe_images_household_recipe_cook_log_fk" FOREIGN KEY ("household_id","recipe_id","cook_log_id") REFERENCES "public"."recipe_cook_logs"("household_id","recipe_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_images_recipe_id_position_id_idx" ON "recipe_images" USING btree ("recipe_id","position","id");--> statement-breakpoint
CREATE INDEX "recipe_images_cook_log_id_position_id_idx" ON "recipe_images" USING btree ("cook_log_id","position","id");
