-- Custom SQL migration file, put your code below! --
ALTER PUBLICATION "home_hub_zero"
ADD TABLE "recipe_images" (
  "id",
  "household_id",
  "recipe_id",
  "cook_log_id",
  "content_type",
  "byte_size",
  "position",
  "confirmed_at",
  "width",
  "height",
  "created_at",
  "updated_at"
);