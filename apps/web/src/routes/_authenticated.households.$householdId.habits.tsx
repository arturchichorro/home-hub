import { habitViewSearchSchema } from "@home-hub/shared/habit-stats";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/habits",
)({
  validateSearch: habitViewSearchSchema,
  component: HabitsRoute,
});

function HabitsRoute() {
  const { householdId } = Route.useParams();

  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="habits">
      <Outlet />
    </HouseholdModuleGate>
  );
}
