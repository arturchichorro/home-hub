import { Button } from "@home-hub/ui-web";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { ApplicationState } from "../application-state";
import { logoutGuestAccess, refreshGuestAccessToken } from "../guest/api";
import { GuestApp } from "../guest/guest-app";
import { GuestSessionProvider, useGuestSession } from "../guest/session";
import { clearRecipeImageUrlCache } from "../recipes/recipe-image-url-cache";
import { RecipeModuleProvider } from "../recipes/recipe-module";
import { HomeHubZeroProvider } from "../zero/provider";

export const Route = createFileRoute("/_guest")({
  beforeLoad: ({ context }) => {
    if (context.applicationMode !== "guest") throw redirect({ to: "/" });
  },
  component: GuestLayout,
});

function GuestLayout() {
  return (
    <GuestSessionProvider>
      <GuestSessionLayout />
    </GuestSessionProvider>
  );
}

function GuestSessionLayout() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const navigate = useNavigate();
  const { loading, session, setSession } = useGuestSession();
  const { onZeroReady } = Route.useRouteContext();

  if (pathname === "/join") return <Outlet />;
  if (loading) {
    return (
      <ApplicationState
        title="Opening household…"
        description="Restoring guest access."
        actions={null}
      />
    );
  }
  if (!session) {
    return (
      <ApplicationState
        title="Guest access unavailable"
        description="Scan an active household QR code to continue."
        actions={
          <Button onClick={() => void navigate({ to: "/join" })}>
            Try a QR code
          </Button>
        }
      />
    );
  }

  const closeSession = () => {
    clearRecipeImageUrlCache(session.cacheIdentity);
    setSession(null);
    void navigate({ to: "/join", replace: true });
  };

  return (
    <HomeHubZeroProvider
      cacheIdentity={session.cacheIdentity}
      canWrite={session.access === "write"}
      requestAccess={{
        actor: { kind: "guest" },
        householdScope: {
          householdId: session.household.id,
          permission: session.access,
        },
      }}
      accessToken={session.accessToken}
      refreshAccessToken={refreshGuestAccessToken}
      onAccessTokenRefreshed={(accessToken) =>
        setSession({ ...session, accessToken })
      }
      onSessionExpired={closeSession}
      onReady={onZeroReady}
    >
      <GuestApp
        access={session.access}
        householdName={session.household.name}
        onLeave={() => void logoutGuestAccess().finally(closeSession)}
      >
        <RecipeModuleProvider
          accessToken={session.accessToken}
          cacheIdentity={session.cacheIdentity}
          householdId={session.household.id}
          mode="guest"
          onSessionExpired={closeSession}
        >
          <Outlet />
        </RecipeModuleProvider>
      </GuestApp>
    </HomeHubZeroProvider>
  );
}
