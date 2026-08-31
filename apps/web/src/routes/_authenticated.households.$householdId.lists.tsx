import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/lists",
)({ component: ListsLayout });

function ListsLayout() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="lists">
      <Outlet />
    </HouseholdModuleGate>
  );
}
