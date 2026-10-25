import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { WorkoutsLibrary } from "../workouts/workouts-library";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/workouts/",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(queries.workouts.byHousehold(params));
  },
  component: WorkoutsRoute,
});
function WorkoutsRoute() {
  const { householdId } = Route.useParams();
  return <WorkoutsLibrary key={householdId} householdId={householdId} />;
}
