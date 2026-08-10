import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { HouseholdSettings } from "../households/household-settings";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/settings",
)({
  component: HouseholdSettingsRoute,
});

function HouseholdSettingsRoute() {
  const navigate = useNavigate();
  const { householdId } = Route.useParams();
  const { session, onSessionExpired } = Route.useRouteContext();

  return (
    <section
      aria-labelledby="household-management-heading"
      className="grid gap-6"
    >
      <h2 id="household-management-heading" className="text-xl font-semibold">
        Household management
      </h2>
      <HouseholdSettings
        accessToken={session.accessToken}
        householdId={householdId}
        onLeftHousehold={() => void navigate({ to: "/" })}
        onSessionExpired={onSessionExpired}
      />
    </section>
  );
}
