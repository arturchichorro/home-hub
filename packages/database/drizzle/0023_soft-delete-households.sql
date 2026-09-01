ALTER TABLE "households" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Households uses an explicit publication column list, so re-register it to
-- expose the soft-delete marker to Zero.
ALTER PUBLICATION "home_hub_zero" DROP TABLE "public"."households";--> statement-breakpoint
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."households" (
  "id",
  "name",
  "deleted_at",
  "created_at",
  "updated_at"
);
