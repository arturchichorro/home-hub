import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute, redirect } from "@tanstack/react-router";
import App from "../App";
import { HouseholdWorkspace } from "../households/household-workspace";

export const Route = createFileRoute("/_authenticated/households/$householdId")(
  {
    beforeLoad: ({ context, params }) => {
      if (
        context.guestAccess &&
        context.guestAccess.guest.householdId !== params.householdId
      )
        throw redirect({
          to: "/households/$householdId",
          params: { householdId: context.guestAccess.guest.householdId },
        });
    },
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
  const { onLoggedOut, onSessionExpired, accessToken, username } =
    Route.useRouteContext();

  return (
    <App
      accessToken={accessToken}
      username={username}
      onLoggedOut={onLoggedOut}
      onSessionExpired={onSessionExpired}
    >
      <HouseholdWorkspace />
    </App>
  );
}
