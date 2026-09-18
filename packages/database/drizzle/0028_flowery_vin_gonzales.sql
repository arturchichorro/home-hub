CREATE TYPE "public"."household_guest_access_level" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "household_guest_access_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"access" "household_guest_access_level" NOT NULL,
	"token_hash" text NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_guest_access_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "household_guest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guest_access_link_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_guest_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "household_guest_access_links" ADD CONSTRAINT "household_guest_access_links_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_guest_access_links" ADD CONSTRAINT "household_guest_access_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_guest_sessions" ADD CONSTRAINT "household_guest_sessions_guest_access_link_id_household_guest_access_links_id_fk" FOREIGN KEY ("guest_access_link_id") REFERENCES "public"."household_guest_access_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "household_guest_access_links_household_id_created_at_idx" ON "household_guest_access_links" USING btree ("household_id","created_at","id");--> statement-breakpoint
CREATE INDEX "household_guest_sessions_guest_access_link_id_idx" ON "household_guest_sessions" USING btree ("guest_access_link_id");