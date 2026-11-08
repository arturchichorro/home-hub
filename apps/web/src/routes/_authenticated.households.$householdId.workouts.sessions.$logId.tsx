import { createFileRoute } from "@tanstack/react-router";
import { TrainingSessionPage } from "../workouts/training-session";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/sessions/$logId",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return <TrainingSessionPage key={params.logId} {...params} />;
}
