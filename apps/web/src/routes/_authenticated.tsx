import { zeroCacheIdentity } from "@home-hub/shared/zero/context";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { HomeHubZeroProvider } from "../zero/provider";
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: ({ context, location }) => {
    const guest = context.guestAccess;
    if (!guest && !context.session)
      throw redirect({ to: "/login", search: { redirect: location.pathname } });
    if (guest)
      return {
        accessToken: guest.credential,
        cacheIdentity: zeroCacheIdentity({ guest: guest.guest }),
        username: "Guest",
        onSessionExpired: context.leaveGuest,
      };
    if (!context.session) throw new Error("Account unavailable");
    return {
      accessToken: context.session.accessToken,
      cacheIdentity: context.session.user.id,
      username: context.session.user.username,
      onSessionExpired: context.onSessionExpired,
    };
  },
  component: AuthenticatedLayout,
});
function AuthenticatedLayout() {
  const {
    onAccessTokenRefreshed,
    onLoggedOut,
    onZeroReady,
    accessToken,
    cacheIdentity,
    guestAccess,
    leaveGuest,
  } = Route.useRouteContext();
  return (
    <HomeHubZeroProvider
      userId={cacheIdentity}
      accessToken={accessToken}
      guestAccess={guestAccess}
      onAccessTokenRefreshed={onAccessTokenRefreshed}
      onSessionExpired={guestAccess ? leaveGuest : onLoggedOut}
      onReady={onZeroReady}
    >
      <Outlet />
    </HomeHubZeroProvider>
  );
}
