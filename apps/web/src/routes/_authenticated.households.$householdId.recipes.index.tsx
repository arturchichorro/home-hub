import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { RecipeLibrary } from "../recipes/recipe-library";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes/",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(
      queries.recipes.byHousehold({ householdId: params.householdId }),
    );
  },
  component: RecipeLibraryRoute,
});

function RecipeLibraryRoute() {
  return <RecipeLibrary />;
}
