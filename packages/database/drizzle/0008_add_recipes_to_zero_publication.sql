-- Custom SQL migration file, put your code below! --
ALTER PUBLICATION "home_hub_zero"
ADD TABLE
  "recipes" (
    "id",
    "household_id",
    "title",
    "description",
    "created_at",
    "updated_at"
  ),
  "recipe_ingredients" (
    "id",
    "household_id",
    "recipe_id",
    "name",
    "quantity",
    "unit",
    "note",
    "position",
    "created_at",
    "updated_at"
  ),
  "recipe_cook_logs" (
    "id",
    "household_id",
    "recipe_id",
    "cooked_at",
    "comment",
    "created_at",
    "updated_at"
  );