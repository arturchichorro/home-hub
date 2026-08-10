import { createFileRoute } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  const { session, onSessionExpired } = Route.useRouteContext();

  return (
    <App
      accessToken={session.accessToken}
      username={session.user.username}
      onSessionExpired={onSessionExpired}
    />
  );
}
