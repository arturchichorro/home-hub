import { createFileRoute } from "@tanstack/react-router";
import { RecipeLibrary } from "../recipes/recipe-library";

export const Route = createFileRoute("/_guest/recipes/")({
  component: GuestRecipeLibrary,
});

function GuestRecipeLibrary() {
  return <RecipeLibrary />;
}
