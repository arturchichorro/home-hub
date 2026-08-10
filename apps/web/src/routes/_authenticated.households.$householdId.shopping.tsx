import { createFileRoute } from "@tanstack/react-router";
import { ShoppingList } from "../shopping/shopping-list";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/shopping",
)({
  component: ShoppingRoute,
});

function ShoppingRoute() {
  const { householdId } = Route.useParams();

  return <ShoppingList householdId={householdId} />;
}
