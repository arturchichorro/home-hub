-- Explicitly use public: Zero creates a home_hub schema, which PostgreSQL's
-- default "$user", public search path prefers for the home_hub database role.
CREATE TYPE "public"."list_item_status" AS ENUM('active', 'crossed', 'archived');--> statement-breakpoint
CREATE TABLE "public"."list_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" "public"."list_item_status" DEFAULT 'active' NOT NULL,
	"sort_key" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public"."lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sort_key" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lists_household_id_id_unique" UNIQUE("household_id","id")
);
--> statement-breakpoint
ALTER TABLE "public"."list_items" ADD CONSTRAINT "list_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."list_items" ADD CONSTRAINT "list_items_household_list_fk" FOREIGN KEY ("household_id","list_id") REFERENCES "public"."lists"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public"."lists" ADD CONSTRAINT "lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "list_items_household_id_list_id_normalized_name_idx" ON "public"."list_items" USING btree ("household_id","list_id","normalized_name");--> statement-breakpoint
CREATE INDEX "list_items_household_id_list_id_status_sort_key_id_idx" ON "public"."list_items" USING btree ("household_id","list_id","status","sort_key","id");--> statement-breakpoint
CREATE UNIQUE INDEX "lists_household_id_normalized_name_idx" ON "public"."lists" USING btree ("household_id","normalized_name");--> statement-breakpoint
CREATE INDEX "lists_household_id_sort_key_id_idx" ON "public"."lists" USING btree ("household_id","sort_key","id");
