import { createFileRoute } from "@tanstack/react-router";
import { TrainingSessionPage } from "../workouts/training-session";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/session",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return <TrainingSessionPage key={params.householdId} {...params} />;
}
