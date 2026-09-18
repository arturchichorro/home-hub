import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";
import { RecipeModuleProvider } from "../recipes/recipe-module";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes",
)({
  component: RecipesLayout,
});

function RecipesLayout() {
  const { householdId } = Route.useParams();
  const { onSessionExpired, session } = Route.useRouteContext();

  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="recipes">
      <RecipeModuleProvider
        accessToken={session.accessToken}
        cacheIdentity={session.user.id}
        householdId={householdId}
        mode="account"
        onSessionExpired={onSessionExpired}
      >
        <Outlet />
      </RecipeModuleProvider>
    </HouseholdModuleGate>
  );
}
