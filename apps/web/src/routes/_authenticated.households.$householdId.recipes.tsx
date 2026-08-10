import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";
import { RecipeList } from "../recipes/recipe-list";
import { validateRecipesSearch } from "../recipes/recipe-search";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes",
)({
  validateSearch: validateRecipesSearch,
  loaderDeps: ({ search }) => ({ recipeId: search.recipeId }),
  loader: ({ context, deps, params }) => {
    const householdId = params.householdId;

    void context.zero?.run(queries.recipes.byHousehold({ householdId }));

    if (deps.recipeId) {
      void context.zero?.run(
        queries.recipes.detail({ householdId, recipeId: deps.recipeId }),
      );
    }
  },
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
    <HouseholdModuleGate householdId={householdId} moduleKey="recipes">
      <RecipeList
        accessToken={session.accessToken}
        householdId={householdId}
        selectedRecipeId={recipeId}
        onSelectRecipe={selectRecipe}
        onSessionExpired={onSessionExpired}
      />
    </HouseholdModuleGate>
  );
}
