CREATE TABLE "log_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"color" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "log_categories_context" UNIQUE("household_id","id"),
	CONSTRAINT "log_categories_name" CHECK (length(trim("log_categories"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "log_categories_color" CHECK ("log_categories"."color" IN ('slate','red','orange','amber','green','teal','blue','violet'))
);
--> statement-breakpoint
CREATE TABLE "log_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"log_id" uuid NOT NULL,
	"entry_on" text NOT NULL,
	"note" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"last_edited_by" uuid NOT NULL,
	"last_write_id" uuid NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "log_entries_date" CHECK ("log_entries"."entry_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "log_entries"."entry_on"::date::text="log_entries"."entry_on"),
	CONSTRAINT "log_entries_note" CHECK (length(trim("log_entries"."note")) BETWEEN 1 AND 20000),
	CONSTRAINT "log_entries_version" CHECK ("log_entries"."version">0)
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"category_id" uuid,
	"last_entry_on" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "logs_context" UNIQUE("household_id","id"),
	CONSTRAINT "logs_title" CHECK (length(trim("logs"."title")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "log_categories" ADD CONSTRAINT "log_categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_log_fk" FOREIGN KEY ("household_id","log_id") REFERENCES "public"."logs"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_category_fk" FOREIGN KEY ("household_id","category_id") REFERENCES "public"."log_categories"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "log_categories_active_name" ON "log_categories" USING btree ("household_id","normalized_name") WHERE "log_categories"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "log_entries_active_day" ON "log_entries" USING btree ("household_id","log_id","entry_on") WHERE "log_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "logs_active_title" ON "logs" USING btree ("household_id","normalized_title") WHERE "logs"."deleted_at" IS NULL;
--> statement-breakpoint
INSERT INTO household_module_settings (household_id,module_key,enabled) SELECT id,'logs',false FROM households ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION refresh_log_last_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h uuid; l uuid;
BEGIN
 IF TG_OP='DELETE' THEN h:=OLD.household_id; l:=OLD.log_id; ELSE h:=NEW.household_id; l:=NEW.log_id; END IF;
 UPDATE logs SET last_entry_on=(SELECT max(entry_on) FROM log_entries WHERE household_id=h AND log_id=l AND deleted_at IS NULL)
 WHERE household_id=h AND id=l;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER log_entries_refresh_last AFTER INSERT OR UPDATE OR DELETE ON log_entries FOR EACH ROW EXECUTE FUNCTION refresh_log_last_entry();
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE logs,log_categories,
 log_entries (id,household_id,log_id,entry_on,note,version,created_by,last_edited_by,deleted_at,created_at,updated_at);
