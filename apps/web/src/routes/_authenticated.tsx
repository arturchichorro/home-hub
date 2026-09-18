import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HomeHubZeroProvider } from "../zero/provider";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    if (context.applicationMode === "guest") {
      throw redirect({ to: "/recipes" });
    }
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
  const { onAccessTokenRefreshed, onLoggedOut, onZeroReady, session } =
    Route.useRouteContext();

  return (
    <HomeHubZeroProvider
      cacheIdentity={session.user.id}
      canWrite
      requestAccess={{
        actor: { kind: "account", accountId: session.user.id },
      }}
      accessToken={session.accessToken}
      onAccessTokenRefreshed={onAccessTokenRefreshed}
      onSessionExpired={onLoggedOut}
      onReady={onZeroReady}
    >
      <Outlet />
    </HomeHubZeroProvider>
  );
}
