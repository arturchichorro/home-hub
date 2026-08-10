import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HomeHubZeroProvider } from "../zero/provider";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }

    return { session: context.session };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session } = Route.useRouteContext();

  return (
    <HomeHubZeroProvider
      userId={session.user.id}
      accessToken={session.accessToken}
    >
      <Outlet />
    </HomeHubZeroProvider>
  );
}
