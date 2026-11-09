import { createFileRoute } from "@tanstack/react-router";
import { ExerciseDetailPage } from "../workouts/exercise-detail";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/exercises/$exerciseId",
)({ component: Page });
function Page() {
  const params = Route.useParams();
  return (
    <ExerciseDetailPage
      key={`${params.householdId}:${params.exerciseId}`}
      {...params}
    />
  );
}
