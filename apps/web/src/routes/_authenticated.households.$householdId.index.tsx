import { queries } from "@home-hub/shared/zero/queries";
import { InlineAlert } from "@home-hub/ui-web";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useGuestAccess } from "../guest-access/context";
import { getDefaultHouseholdModuleRoute } from "../households/household-module-gate";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(
      queries.modules.byHousehold({ householdId: params.householdId }),
    );
  },
  component: HouseholdIndexRoute,
});

function HouseholdIndexRoute() {
  const { householdId } = Route.useParams();
  const guest = useGuestAccess();
  const [settings, result] = useQuery(
    queries.modules.byHousehold({ householdId }),
  );

  if (result.type === "error") {
    return (
      <InlineAlert role="alert" variant="danger">
        Unable to load household modules.
      </InlineAlert>
    );
  }

  if (result.type !== "complete") {
    return null;
  }

  if (guest && !settings.some((setting) => setting.enabled))
    return <p>No modules are enabled for this household.</p>;

  return (
    <Navigate
      to={getDefaultHouseholdModuleRoute(settings)}
      params={{ householdId }}
      replace
    />
  );
}
