import { createFileRoute } from "@tanstack/react-router";
import { RecipeDetail } from "../recipes/recipe-detail";

export const Route = createFileRoute("/_guest/recipes/$recipeId")({
  component: GuestRecipeDetail,
});

function GuestRecipeDetail() {
  const { recipeId } = Route.useParams();
  return <RecipeDetail recipeId={recipeId} />;
}
