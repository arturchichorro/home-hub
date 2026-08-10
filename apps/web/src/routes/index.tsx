import { createFileRoute } from "@tanstack/react-router";
import App from "../App";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  const { session } = Route.useRouteContext();

  return <App username={session.user.username} />;
}
