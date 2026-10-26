import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { MediaSessionProvider } from "../media/session";
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
  const {
    onAccessTokenRefreshed,
    onLoggedOut,
    onZeroReady,
    onSessionExpired,
    session,
  } = Route.useRouteContext();

  return (
    <HomeHubZeroProvider
      userId={session.user.id}
      accessToken={session.accessToken}
      onAccessTokenRefreshed={onAccessTokenRefreshed}
      onSessionExpired={onLoggedOut}
      onReady={onZeroReady}
    >
      <MediaSessionProvider
        value={{
          accessToken: session.accessToken,
          userId: session.user.id,
          onSessionExpired,
        }}
      >
        <Outlet />
      </MediaSessionProvider>
    </HomeHubZeroProvider>
  );
}
