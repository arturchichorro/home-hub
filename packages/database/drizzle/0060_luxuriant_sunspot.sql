ALTER TABLE "household_members" ADD COLUMN "module_order" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_module_order_array" CHECK (jsonb_typeof("household_members"."module_order") = 'array');
--> statement-breakpoint
-- Membership metadata uses an explicit publication column list (0021).
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."household_members";
--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."household_members"
  ("id", "household_id", "user_id", "role", "sort_key", "module_order", "created_at", "updated_at");