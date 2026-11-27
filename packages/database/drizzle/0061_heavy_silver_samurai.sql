CREATE TABLE "calendar_habit_attachments" (
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	"time_zone" text NOT NULL,
	CONSTRAINT "calendar_habit_attachments_item_id_user_id_pk" PRIMARY KEY("item_id","user_id"),
	CONSTRAINT "calendar_habit_attachments_zone" CHECK (length("calendar_habit_attachments"."time_zone") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "habit_entries" ADD COLUMN "calendar_eligible_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_habit_attachments" ADD CONSTRAINT "calendar_habit_attachments_household_id_item_id_calendar_items_household_id_id_fk" FOREIGN KEY ("household_id","item_id") REFERENCES "public"."calendar_items"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_habit_attachments" ADD CONSTRAINT "calendar_habit_attachments_household_id_habit_id_habits_household_id_id_fk" FOREIGN KEY ("household_id","habit_id") REFERENCES "public"."habits"("household_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_habit_attachments" ADD CONSTRAINT "calendar_habit_attachments_household_id_user_id_household_members_household_id_user_id_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_habit_attachments_habit" ON "calendar_habit_attachments" USING btree ("household_id","habit_id","user_id");
--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."calendar_habit_attachments";
--> statement-breakpoint
-- habit_entries uses an explicit column list; publish the safe eligibility only.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."habit_entries";
--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."habit_entries"
  ("household_id","habit_id","user_id","entry_on","created_at","updated_at","completed","note","workout_completed","calendar_eligible_at");