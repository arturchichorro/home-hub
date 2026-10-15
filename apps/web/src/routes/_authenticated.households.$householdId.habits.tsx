import { createFileRoute } from "@tanstack/react-router";
import { HabitsPage } from "../habits/habits-page";
import { HouseholdModuleGate } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/habits",
)({
  component: HabitsRoute,
});
function HabitsRoute() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="habits">
      <HabitsPage key={householdId} householdId={householdId} />
    </HouseholdModuleGate>
  );
}
