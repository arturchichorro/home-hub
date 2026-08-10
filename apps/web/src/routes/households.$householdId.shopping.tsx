import { createFileRoute } from "@tanstack/react-router";
import { ShoppingList } from "../shopping/shopping-list";

export const Route = createFileRoute("/households/$householdId/shopping")({
  component: ShoppingRoute,
});

function ShoppingRoute() {
  const { householdId } = Route.useParams();

  return <ShoppingList householdId={householdId} />;
}
