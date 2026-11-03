import { createFileRoute } from "@tanstack/react-router";
import { DocumentsPage } from "../documents/documents-page";
import { HouseholdModuleGate } from "../households/household-module-gate";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/documents",
)({ component: DocumentsRoute });
function DocumentsRoute() {
  const { householdId } = Route.useParams();
  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="documents">
      <DocumentsPage key={householdId} householdId={householdId} />
    </HouseholdModuleGate>
  );
}
