import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { WorkoutDetail } from "../workouts/workout-detail";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/$workoutId",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(queries.workouts.detail(params));
  },
  component: WorkoutRoute,
});
function WorkoutRoute() {
  const { householdId, workoutId } = Route.useParams();
  return (
    <WorkoutDetail
      key={workoutId}
      householdId={householdId}
      workoutId={workoutId}
    />
  );
}
