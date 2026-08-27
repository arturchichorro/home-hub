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
  const { householdId } = Route.useParams();
  const { onSessionExpired, session } = Route.useRouteContext();

  return (
    <RecipeLibrary
      accessToken={session.accessToken}
      householdId={householdId}
      onSessionExpired={onSessionExpired}
      userId={session.user.id}
    />
  );
}
