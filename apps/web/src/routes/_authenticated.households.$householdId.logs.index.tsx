import { createFileRoute } from "@tanstack/react-router";
import { LogsIndex } from "../logs/logs-index";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/logs/",
)({ component: Page });
function Page() {
  const { householdId } = Route.useParams();
  return <LogsIndex key={householdId} householdId={householdId} />;
}
