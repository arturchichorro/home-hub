-- Publish only the non-sensitive profile fields needed by household members.
-- Email addresses, password hashes, and account timestamps stay private.
ALTER PUBLICATION "home_hub_zero" ADD TABLE "public"."users" (
  "id",
  "username"
);
