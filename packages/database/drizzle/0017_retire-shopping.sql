-- Lists is already live. Remove the bridge before deleting legacy settings:
-- the old DELETE trigger would otherwise remove the active Lists setting too.
DROP TRIGGER "shopping_module_mirror_to_lists" ON "public"."household_module_settings";
--> statement-breakpoint
DROP TRIGGER "shopping_items_mirror_to_lists" ON "public"."shopping_items";
--> statement-breakpoint
DROP FUNCTION "public"."mirror_shopping_module_to_lists"();
--> statement-breakpoint
DROP FUNCTION "public"."mirror_shopping_item_to_lists"();
--> statement-breakpoint
DELETE FROM "public"."household_module_settings" WHERE "module_key" = 'shopping';
--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."shopping_items";
--> statement-breakpoint
-- These are retired source records and migration bookkeeping, not the live
-- lists or list_items. No CASCADE: unexpected dependencies must fail visibly.
DROP TABLE "public"."shopping_list_migration_links";
--> statement-breakpoint
DROP TABLE "public"."shopping_items";
--> statement-breakpoint
DROP TYPE "public"."shopping_item_status";
