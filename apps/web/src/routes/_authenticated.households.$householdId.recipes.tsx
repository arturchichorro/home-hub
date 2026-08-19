import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/recipes",
)({
  component: RecipesLayout,
});

function RecipesLayout() {
  const { householdId } = Route.useParams();

  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="recipes">
      <Outlet />
    </HouseholdModuleGate>
  );
}
