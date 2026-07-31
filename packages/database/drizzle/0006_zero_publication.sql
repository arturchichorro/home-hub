-- Custom SQL migration file, put your code below! --
CREATE PUBLICATION "home_hub_zero"
FOR TABLE
  "households" (
    "id",
    "name",
    "created_at",
    "updated_at"
  ),
  "household_members" (
    "id",
    "household_id",
    "user_id",
    "role",
    "created_at",
    "updated_at"
  ),
  "shopping_items" (
    "id",
    "household_id",
    "name",
    "normalized_name",
    "status",
    "created_at",
    "updated_at"
  );