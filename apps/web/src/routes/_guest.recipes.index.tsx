import { createFileRoute } from "@tanstack/react-router";
import { useGuestSession } from "../guest/session";
import { RecipeLibrary } from "../recipes/recipe-library";

export const Route = createFileRoute("/_guest/recipes/")({
  component: GuestRecipeLibrary,
});

function GuestRecipeLibrary() {
  const { session, setSession } = useGuestSession();
  if (!session) return null;
  return (
    <RecipeLibrary
      accessToken={session.accessToken}
      householdId={session.household.id}
      onSessionExpired={() => setSession(null)}
      cacheIdentity={session.cacheIdentity}
      routeMode="guest"
    />
  );
}
