import { createFileRoute } from "@tanstack/react-router";
import { RecipeList } from "../recipes/recipe-list";
import { validateRecipesSearch } from "../recipes/recipe-search";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes",
)({
  validateSearch: validateRecipesSearch,
  component: RecipesRoute,
});

function RecipesRoute() {
  const { householdId } = Route.useParams();
  const { recipeId } = Route.useSearch();
  const { session, onSessionExpired } = Route.useRouteContext();
  const navigate = Route.useNavigate();

  function selectRecipe(nextRecipeId: string | undefined) {
    void navigate({
      search: nextRecipeId ? { recipeId: nextRecipeId } : {},
      replace: true,
    });
  }

  return (
    <RecipeList
      accessToken={session.accessToken}
      householdId={householdId}
      selectedRecipeId={recipeId}
      onSelectRecipe={selectRecipe}
      onSessionExpired={onSessionExpired}
    />
  );
}
