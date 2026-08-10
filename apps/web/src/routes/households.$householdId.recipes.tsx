import { createFileRoute } from "@tanstack/react-router";
import { RecipeList } from "../recipes/recipe-list";

export const Route = createFileRoute("/households/$householdId/recipes")({
  component: RecipesRoute,
});

function RecipesRoute() {
  const { householdId } = Route.useParams();
  const { session, onSessionExpired } = Route.useRouteContext();

  return (
    <RecipeList
      accessToken={session.accessToken}
      householdId={householdId}
      onSessionExpired={onSessionExpired}
    />
  );
}
