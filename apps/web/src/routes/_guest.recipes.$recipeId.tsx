import { createFileRoute } from "@tanstack/react-router";
import { useGuestSession } from "../guest/session";
import { RecipeDetail } from "../recipes/recipe-detail";

export const Route = createFileRoute("/_guest/recipes/$recipeId")({
  component: GuestRecipeDetail,
});

function GuestRecipeDetail() {
  const { recipeId } = Route.useParams();
  const { session, setSession } = useGuestSession();
  if (!session) return null;
  return (
    <RecipeDetail
      accessToken={session.accessToken}
      householdId={session.household.id}
      recipeId={recipeId}
      onSessionExpired={() => setSession(null)}
      cacheIdentity={session.cacheIdentity}
      routeMode="guest"
    />
  );
}
