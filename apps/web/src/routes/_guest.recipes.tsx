import { Button } from "@home-hub/ui-web";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { ApplicationState } from "../application-state";
import { useGuestAccess } from "../guest/access";
import { guestAuthorization } from "../guest/api";
import { GuestApp } from "../guest/guest-app";
import { clearRecipeImageUrlCache } from "../recipes/recipe-image-url-cache";
import { RecipeModuleProvider } from "../recipes/recipe-module";
import { HomeHubZeroProvider } from "../zero/provider";

export const Route = createFileRoute("/_guest/recipes")({
  component: GuestRecipesLayout,
});

function GuestRecipesLayout() {
  const navigate = useNavigate();
  const { loading, credential, context, clear, refreshAuthorization } =
    useGuestAccess();
  const { onZeroReady } = Route.useRouteContext();

  if (loading) {
    return (
      <ApplicationState
        title="Opening household…"
        description="Restoring guest access."
        actions={null}
      />
    );
  }
  if (!credential || !context) {
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

  const closeAccess = () => {
    clearRecipeImageUrlCache(context.cacheIdentity);
    clear();
    window.history.replaceState(null, "", "/join");
    void navigate({ to: "/join", replace: true });
  };

  if (!context.enabledModules.includes("recipes")) {
    return (
      <ApplicationState
        title="No shared modules available"
        description="This household is not currently sharing Recipes."
        actions={<Button onClick={closeAccess}>Leave Guest access</Button>}
      />
    );
  }

  return (
    <HomeHubZeroProvider
      cacheIdentity={context.cacheIdentity}
      canWrite={context.access === "write"}
      requestAccess={{
        actor: { kind: "guest" },
        householdScope: {
          householdId: context.household.id,
          permission: context.access,
        },
      }}
      accessToken={guestAuthorization(credential)}
      refreshAccessToken={refreshAuthorization}
      onAccessTokenRefreshed={() => undefined}
      onSessionExpired={closeAccess}
      onReady={onZeroReady}
    >
      <GuestApp
        access={context.access}
        householdName={context.household.name}
        onLeave={closeAccess}
      >
        <RecipeModuleProvider
          accessToken={guestAuthorization(credential)}
          cacheIdentity={context.cacheIdentity}
          householdId={context.household.id}
          mode="guest"
          onSessionExpired={closeAccess}
        >
          <Outlet />
        </RecipeModuleProvider>
      </GuestApp>
    </HomeHubZeroProvider>
  );
}
