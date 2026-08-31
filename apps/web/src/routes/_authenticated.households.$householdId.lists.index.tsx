import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { ListsLibrary } from "../lists/lists-library";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/lists/",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(
      queries.lists.byHousehold({ householdId: params.householdId }),
    );
  },
  component: ListsRoute,
});
function ListsRoute() {
  const { householdId } = Route.useParams();
  return <ListsLibrary key={householdId} householdId={householdId} />;
}
