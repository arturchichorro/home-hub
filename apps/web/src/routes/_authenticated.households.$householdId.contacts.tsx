import { createFileRoute, Outlet } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/contacts",
)({ component: Layout });

function Layout() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate
      householdId={householdId}
      moduleKey="contacts"
      preserveChildrenWhileRedirecting
    >
      <Outlet />
    </HouseholdModuleGate>
  );
}
