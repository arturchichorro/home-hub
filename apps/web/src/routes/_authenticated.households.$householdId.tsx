import { createFileRoute } from "@tanstack/react-router";
import App from "../App";
import { HouseholdWorkspace } from "../households/household-workspace";

export const Route = createFileRoute("/_authenticated/households/$householdId")(
  {
    component: HouseholdRoute,
  },
);

function HouseholdRoute() {
  const { householdId } = Route.useParams();
  const { onSessionExpired, session } = Route.useRouteContext();

  return (
    <App
      householdId={householdId}
      username={session.user.username}
      onSessionExpired={onSessionExpired}
    >
      <HouseholdWorkspace householdId={householdId} />
    </App>
  );
}
