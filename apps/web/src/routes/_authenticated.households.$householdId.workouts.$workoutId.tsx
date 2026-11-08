import { trainingLogSearchSchema } from "@home-hub/shared/training";
import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { WorkoutDetail } from "../workouts/workout-detail";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/$workoutId",
)({
  validateSearch: (
    search: Record<string, unknown>,
  ): { log?: string | undefined } => {
    const parsed = trainingLogSearchSchema.safeParse(search);
    return parsed.success ? parsed.data : {};
  },
  loader: ({ context, params }) => {
    void context.zero?.run(queries.workouts.detail(params));
  },

  component: WorkoutRoute,
});

function WorkoutRoute() {
  const { householdId, workoutId } = Route.useParams();
  const { log } = Route.useSearch();

  return (
    <WorkoutDetail
      key={workoutId}
      householdId={householdId}
      workoutId={workoutId}
      initialLogId={log}
    />
  );
}
