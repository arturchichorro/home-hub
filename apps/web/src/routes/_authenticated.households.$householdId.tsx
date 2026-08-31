import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import App from "../App";
import { HouseholdWorkspace } from "../households/household-workspace";

export const Route = createFileRoute("/_authenticated/households/$householdId")(
  {
    loader: ({ context, params }) => {
      void context.zero?.run(queries.households.mine({}));
      void context.zero?.run(queries.householdMemberships.mine({}));
      void context.zero?.run(
        queries.modules.byHousehold({ householdId: params.householdId }),
      );
    },
    component: HouseholdRoute,
  },
);

function HouseholdRoute() {
  const { onLoggedOut, onSessionExpired, session } = Route.useRouteContext();

  return (
    <App
      accessToken={session.accessToken}
      username={session.user.username}
      onLoggedOut={onLoggedOut}
      onSessionExpired={onSessionExpired}
    >
      <HouseholdWorkspace />
    </App>
  );
}
