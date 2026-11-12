CREATE TABLE "calendar_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"day" text NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_key" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_items_context" UNIQUE("household_id","id"),
	CONSTRAINT "calendar_items_day" CHECK ("calendar_items"."day" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "calendar_items"."day"::date::text = "calendar_items"."day"),
	CONSTRAINT "calendar_items_title" CHECK (length(trim("calendar_items"."title")) BETWEEN 1 AND 150),
	CONSTRAINT "calendar_items_note" CHECK (length("calendar_items"."note") <= 10000)
);
--> statement-breakpoint
CREATE TABLE "calendar_people" (
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "calendar_people_item_id_user_id_pk" PRIMARY KEY("item_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_people" ADD CONSTRAINT "calendar_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_people" ADD CONSTRAINT "calendar_people_item_fk" FOREIGN KEY ("household_id","item_id") REFERENCES "public"."calendar_items"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_items_day_order" ON "calendar_items" USING btree ("household_id","day","sort_key","id") WHERE "calendar_items"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "calendar_people_household_user" ON "calendar_people" USING btree ("household_id","user_id");
--> statement-breakpoint
INSERT INTO household_module_settings (household_id,module_key,enabled) SELECT id,'calendar',false FROM households ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE calendar_items, calendar_people;