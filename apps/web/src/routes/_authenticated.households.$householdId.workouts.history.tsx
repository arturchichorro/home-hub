import { createFileRoute } from "@tanstack/react-router";
import { TrainingHistoryPage } from "../workouts/training-history";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/history",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return <TrainingHistoryPage key={params.householdId} {...params} />;
}
