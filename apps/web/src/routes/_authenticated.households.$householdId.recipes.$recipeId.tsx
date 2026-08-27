import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { RecipeDetail } from "../recipes/recipe-detail";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes/$recipeId",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(
      queries.recipes.detail({
        householdId: params.householdId,
        recipeId: params.recipeId,
      }),
    );
  },
  component: RecipeDetailRoute,
});

function RecipeDetailRoute() {
  const { householdId, recipeId } = Route.useParams();
  const { onSessionExpired, session } = Route.useRouteContext();

  return (
    <RecipeDetail
      accessToken={session.accessToken}
      householdId={householdId}
      recipeId={recipeId}
      onSessionExpired={onSessionExpired}
      userId={session.user.id}
    />
  );
}
