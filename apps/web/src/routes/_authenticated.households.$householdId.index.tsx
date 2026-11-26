import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import { HouseholdLanding } from "../households/household-landing";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(queries.householdMemberships.mine({}));
    void context.zero?.run(
      queries.modules.byHousehold({ householdId: params.householdId }),
    );
  },

  component: HouseholdIndexRoute,
});

function HouseholdIndexRoute() {
  const { householdId } = Route.useParams();

  return <HouseholdLanding householdId={householdId} />;
}
