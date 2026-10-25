import { createFileRoute } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";
import { WorkoutsPage } from "../workouts/workouts-page";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts",
)({ component: WorkoutsRoute });
function WorkoutsRoute() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="workouts">
      <WorkoutsPage key={householdId} householdId={householdId} />
    </HouseholdModuleGate>
  );
}
