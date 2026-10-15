CREATE TABLE "habit_completions" (
	"household_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"completed_on" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_completions_habit_id_user_id_completed_on_pk" PRIMARY KEY("habit_id","user_id","completed_on"),
	CONSTRAINT "habit_completions_completed_on_date" CHECK ("habit_completions"."completed_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "habit_completions"."completed_on"::date::text = "habit_completions"."completed_on")
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_on" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_household_id_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "habits_name_length" CHECK (length(trim("habits"."name")) between 1 and 100),
	CONSTRAINT "habits_created_on_date" CHECK ("habits"."created_on" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "habits"."created_on"::date::text = "habits"."created_on")
);
--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_completions" ADD CONSTRAINT "habit_completions_household_habit_fk" FOREIGN KEY ("household_id","habit_id") REFERENCES "public"."habits"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "habit_completions_household_id_date_idx" ON "habit_completions" USING btree ("household_id","completed_on");--> statement-breakpoint
CREATE INDEX "habits_household_id_archived_at_idx" ON "habits" USING btree ("household_id","archived_at");--> statement-breakpoint
-- New modules are opt-in for every existing household.
INSERT INTO "public"."household_module_settings" ("household_id", "module_key", "enabled")
SELECT "id", 'habits', false FROM "public"."households"
ON CONFLICT ("household_id", "module_key") DO NOTHING;--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habits" (
  "id", "household_id", "name", "created_on", "archived_at", "created_at", "updated_at"
);--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habit_completions" (
  "household_id", "habit_id", "user_id", "completed_on", "created_at", "updated_at"
);
