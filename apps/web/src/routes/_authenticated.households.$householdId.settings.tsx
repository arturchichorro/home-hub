import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { HouseholdSettings } from "../households/household-settings";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/settings",
)({
  beforeLoad: ({ context, params }) => {
    if (context.guestAccess)
      throw redirect({ to: "/households/$householdId", params });
  },
  loader: ({ context, params }) => {
    void context.zero?.run(queries.households.mine({}));
    void context.zero?.run(
      queries.householdMemberships.byHousehold({
        householdId: params.householdId,
      }),
    );
    void context.zero?.run(
      queries.modules.byHousehold({ householdId: params.householdId }),
    );
  },
  component: HouseholdSettingsRoute,
});

function HouseholdSettingsRoute() {
  const navigate = useNavigate();
  const { householdId } = Route.useParams();
  const { accessToken, onSessionExpired } = Route.useRouteContext();

  return (
    <section aria-label="Household management" className="grid gap-6">
      <HouseholdSettings
        accessToken={accessToken}
        householdId={householdId}
        onLeftHousehold={() => void navigate({ to: "/" })}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );
}
