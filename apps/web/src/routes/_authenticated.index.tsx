import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute, redirect } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/_authenticated/")({
  beforeLoad: ({ context }) => {
    if (context.guestAccess)
      throw redirect({
        to: "/households/$householdId",
        params: { householdId: context.guestAccess.guest.householdId },
      });
  },
  loader: ({ context }) => {
    void context.zero?.run(queries.households.mine({}));
    void context.zero?.run(queries.householdMemberships.mine({}));
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { onLoggedOut, onSessionExpired, accessToken, username } =
    Route.useRouteContext();

  return (
    <App
      accessToken={accessToken}
      username={username}
      onLoggedOut={onLoggedOut}
      onSessionExpired={onSessionExpired}
    />
  );
}
