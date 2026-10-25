import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts",
)({ component: WorkoutsLayout });
function WorkoutsLayout() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="workouts">
      <Outlet />
    </HouseholdModuleGate>
  );
}
