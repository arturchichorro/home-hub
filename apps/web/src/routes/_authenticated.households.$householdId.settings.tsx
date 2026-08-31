import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HouseholdSettings } from "../households/household-settings";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/settings",
)({
  loader: ({ context, params }) => {
    void context.zero?.run(queries.households.mine({}));
    void context.zero?.run(
      queries.modules.byHousehold({ householdId: params.householdId }),
    );
  },
  component: HouseholdSettingsRoute,
});

function HouseholdSettingsRoute() {
  const navigate = useNavigate();
  const { householdId } = Route.useParams();
  const { session, onSessionExpired } = Route.useRouteContext();

  return (
    <section aria-label="Household management" className="grid gap-6">
      <HouseholdSettings
        accessToken={session.accessToken}
        householdId={householdId}
        onLeftHousehold={() => void navigate({ to: "/" })}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );
}
