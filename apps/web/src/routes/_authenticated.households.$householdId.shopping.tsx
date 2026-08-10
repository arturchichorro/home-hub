import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { HouseholdModuleGate } from "../households/household-module-gate";
import { ShoppingList } from "../shopping/shopping-list";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/shopping",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(
      queries.shopping.byHousehold({ householdId: params.householdId }),
    );
  },
  component: ShoppingRoute,
});

function ShoppingRoute() {
  const { householdId } = Route.useParams();

  return (
    <HouseholdModuleGate householdId={householdId} moduleKey="shopping">
      <ShoppingList householdId={householdId} />
    </HouseholdModuleGate>
  );
}
