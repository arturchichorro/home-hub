import { queries } from "@home-hub/shared/zero/queries";
import { createFileRoute } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/_authenticated/")({
  loader: ({ context }) => {
    void context.zero?.run(queries.households.mine({}));
  },
  component: HomeRoute,
});

function HomeRoute() {
  const { onLoggedOut, onSessionExpired, session } = Route.useRouteContext();

  return (
    <App
      accessToken={session.accessToken}
      username={session.user.username}
      onLoggedOut={onLoggedOut}
      onSessionExpired={onSessionExpired}
    />
  );
}
