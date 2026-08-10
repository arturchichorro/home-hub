import { createFileRoute } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/_authenticated/")({
  component: HomeRoute,
});

function HomeRoute() {
  const { onSessionExpired, session } = Route.useRouteContext();

  return (
    <App username={session.user.username} onSessionExpired={onSessionExpired} />
  );
}
