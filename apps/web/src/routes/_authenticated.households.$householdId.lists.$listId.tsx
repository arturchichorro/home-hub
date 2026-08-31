import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { ListDetail } from "../lists/list-detail";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/lists/$listId",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(queries.lists.detail(params));
  },
  component: ListRoute,
});
function ListRoute() {
  const { householdId, listId } = Route.useParams();
  return (
    <ListDetail
      key={`${householdId}:${listId}`}
      householdId={householdId}
      listId={listId}
    />
  );
}
