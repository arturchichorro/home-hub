CREATE TABLE "household_guest_access_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"access" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_guest_access_links_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "household_guest_access_links_access_check" CHECK ("household_guest_access_links"."access" IN ('read', 'write')),
	CONSTRAINT "household_guest_access_links_name_check" CHECK (length(btrim("household_guest_access_links"."name")) BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "household_guest_access_links" ADD CONSTRAINT "household_guest_access_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_guest_access_links" ADD CONSTRAINT "household_guest_access_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_guest_access_links_household_id_idx" ON "household_guest_access_links" USING btree ("household_id");