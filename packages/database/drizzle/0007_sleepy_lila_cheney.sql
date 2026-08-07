CREATE TABLE "recipe_cook_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"cooked_at" timestamp with time zone NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"unit" text,
	"note" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_ingredients_position_nonnegative" CHECK ("recipe_ingredients"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_household_id_id_idx" UNIQUE("household_id","id")
);
--> statement-breakpoint
ALTER TABLE "recipe_cook_logs" ADD CONSTRAINT "recipe_cook_logs_household_recipe_fk" FOREIGN KEY ("household_id","recipe_id") REFERENCES "public"."recipes"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_household_recipe_fk" FOREIGN KEY ("household_id","recipe_id") REFERENCES "public"."recipes"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_cook_logs_recipe_id_cooked_at_id_idx" ON "recipe_cook_logs" USING btree ("recipe_id","cooked_at","id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_id_position_id_idx" ON "recipe_ingredients" USING btree ("recipe_id","position","id");