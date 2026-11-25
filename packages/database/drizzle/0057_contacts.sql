-- Populated legacy Logs require a separately approved backed-up cutover.
DO $$
BEGIN
 IF (EXISTS (SELECT FROM logs) OR EXISTS (SELECT FROM log_entries) OR EXISTS (SELECT FROM log_categories))
 AND current_setting('home_hub.contacts_cutover_ready', true) IS DISTINCT FROM '1' THEN
  RAISE EXCEPTION 'Contacts cutover requires stopped writers, a fresh backup, and explicit acknowledgement';
 END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "contact_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"entry_on" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"last_edited_by" uuid NOT NULL,
	"last_write_id" uuid NOT NULL,
	"last_write_hash" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_entries_context" UNIQUE("household_id","id"),
	CONSTRAINT "contact_entries_date" CHECK ("contact_entries"."entry_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "contact_entries"."entry_on"::date::text="contact_entries"."entry_on"),
	CONSTRAINT "contact_entries_note" CHECK (length("contact_entries"."note")<=20000),
	CONSTRAINT "contact_entries_version" CHECK ("contact_entries"."version">0)
);
--> statement-breakpoint
CREATE TABLE "contact_entry_people" (
	"household_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	CONSTRAINT "contact_entry_people_entry_id_contact_id_pk" PRIMARY KEY("entry_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"parent_id" uuid NOT NULL,
	"contact_id" uuid,
	"entry_id" uuid,
	"media_id" uuid NOT NULL,
	"sort_key" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_media_parent" CHECK (("contact_media"."contact_id" IS NOT NULL AND "contact_media"."entry_id" IS NULL AND "contact_media"."parent_id"="contact_media"."contact_id") OR ("contact_media"."entry_id" IS NOT NULL AND "contact_media"."contact_id" IS NULL AND "contact_media"."parent_id"="contact_media"."entry_id"))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"search_text" text NOT NULL,
	"details" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"last_write_id" uuid NOT NULL,
	"last_write_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_context" UNIQUE("household_id","id"),
	CONSTRAINT "contacts_name" CHECK (length(trim("contacts"."name")) BETWEEN 1 AND 150),
	CONSTRAINT "contacts_details" CHECK (jsonb_typeof("contacts"."details")='array' AND jsonb_array_length("contacts"."details")<=100),
	CONSTRAINT "contacts_version" CHECK ("contacts"."version">0)
);
--> statement-breakpoint
LOCK TABLE log_entries, logs, log_categories IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DROP TABLE "log_entries";--> statement-breakpoint
DROP TABLE "logs";--> statement-breakpoint
DROP TABLE "log_categories";--> statement-breakpoint
DROP FUNCTION refresh_log_last_entry();--> statement-breakpoint
ALTER TABLE "contact_entries" ADD CONSTRAINT "contact_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entries" ADD CONSTRAINT "contact_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entries" ADD CONSTRAINT "contact_entries_last_edited_by_users_id_fk" FOREIGN KEY ("last_edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entry_people" ADD CONSTRAINT "contact_people_entry_fk" FOREIGN KEY ("household_id","entry_id") REFERENCES "public"."contact_entries"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_entry_people" ADD CONSTRAINT "contact_people_contact_fk" FOREIGN KEY ("household_id","contact_id") REFERENCES "public"."contacts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_media" ADD CONSTRAINT "contact_media_profile_fk" FOREIGN KEY ("household_id","contact_id") REFERENCES "public"."contacts"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_media" ADD CONSTRAINT "contact_media_entry_fk" FOREIGN KEY ("household_id","entry_id") REFERENCES "public"."contact_entries"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_media" ADD CONSTRAINT "contact_media_asset_fk" FOREIGN KEY ("household_id","media_id") REFERENCES "public"."media"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_entries_history" ON "contact_entries" USING btree ("household_id","entry_on","created_at","id") WHERE "contact_entries"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contact_people_profile" ON "contact_entry_people" USING btree ("household_id","contact_id","entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_media_avatar" ON "contact_media" USING btree ("contact_id") WHERE "contact_media"."published" AND "contact_media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contact_media_order" ON "contact_media" USING btree ("household_id","parent_id","sort_key","id") WHERE "contact_media"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "contacts_library" ON "contacts" USING btree ("household_id","archived","normalized_name","id");
--> statement-breakpoint
UPDATE household_module_settings SET module_key='contacts' WHERE module_key='logs';
--> statement-breakpoint
ALTER PUBLICATION home_hub_zero ADD TABLE
 contacts (id,household_id,name,normalized_name,search_text,details,archived,version,created_at,updated_at),
 contact_entries (id,household_id,entry_on,note,published,version,created_by,last_edited_by,deleted_at,created_at,updated_at),
 contact_entry_people, contact_media;
--> statement-breakpoint
CREATE FUNCTION check_contact_entry_people() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
DECLARE targets uuid[];
BEGIN
 IF TG_TABLE_NAME='contact_entries' THEN
  targets := ARRAY[NEW.id, OLD.id];
 ELSE
  targets := ARRAY[NEW.entry_id, OLD.entry_id];
 END IF;
 FOR target IN SELECT DISTINCT unnest(targets) LOOP
  IF EXISTS (SELECT FROM contact_entries WHERE id=target AND deleted_at IS NULL) THEN
   IF NOT EXISTS (SELECT FROM contact_entry_people WHERE entry_id=target) THEN
    RAISE EXCEPTION 'A contact entry must have at least one person' USING ERRCODE='23514';
   END IF;
   IF EXISTS (SELECT FROM contact_entries WHERE id=target AND published AND note !~ '[^[:space:]]')
      AND NOT EXISTS (
       SELECT FROM contact_media a JOIN media m ON m.id=a.media_id AND m.household_id=a.household_id
       WHERE a.entry_id=target AND a.published AND a.deleted_at IS NULL
       AND m.confirmed_at IS NOT NULL AND m.deleted_at IS NULL
      ) THEN
    RAISE EXCEPTION 'A published entry needs text or a confirmed picture' USING ERRCODE='23514';
   END IF;
  END IF;
 END LOOP;
 RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contact_entry_people_required AFTER INSERT OR UPDATE ON contact_entries
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_contact_entry_people();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contact_entry_people_retained AFTER DELETE OR UPDATE ON contact_entry_people
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_contact_entry_people();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER contact_entry_content_retained AFTER INSERT OR UPDATE OR DELETE ON contact_media
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_contact_entry_people();
