import { createFileRoute } from "@tanstack/react-router";
import App from "../App";
import { HouseholdWorkspace } from "../households/household-workspace";

export const Route = createFileRoute("/households/$householdId")({
  component: HouseholdRoute,
});

function HouseholdRoute() {
  const { householdId } = Route.useParams();
  const { session } = Route.useRouteContext();

  return (
    <App householdId={householdId} username={session.user.username}>
      <HouseholdWorkspace householdId={householdId} />
    </App>
  );
}
