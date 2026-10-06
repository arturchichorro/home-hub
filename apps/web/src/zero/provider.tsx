import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { mutators } from "@home-hub/shared/zero/mutators";
import { schema } from "@home-hub/shared/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { type ReactNode, useMemo } from "react";
import type { GuestEntry } from "../guest-access/access";
import { GuestZeroAuth } from "../guest-access/zero-auth";
import { ZeroAuthRefresh } from "./zero-auth-refresh";

const cacheURL = import.meta.env.VITE_ZERO_CACHE_URL;

if (!cacheURL) {
  throw new Error("VITE_ZERO_CACHE_URL is not configured");
}

type HomeHubZeroProviderProps = {
  userId: string;
  guestAccess: GuestEntry | null;
  accessToken: string;
  onAccessTokenRefreshed: (accessToken: string) => void;
  onSessionExpired: () => void;
  onReady: (zero: Zero) => void;
  children: ReactNode;
};

export function HomeHubZeroProvider({
  userId,
  guestAccess,
  accessToken,
  onAccessTokenRefreshed,
  onSessionExpired,
  onReady,
  children,
}: HomeHubZeroProviderProps) {
  const context = useMemo<ZeroAuthContext>(
    () => (guestAccess ? { guest: guestAccess.guest } : { userId }),
    [userId, guestAccess],
  );

  return (
    <ZeroProvider
      cacheURL={
        window.location.hostname === "guest.achichorro.com"
          ? `${window.location.origin}/zero`
          : cacheURL
      }
      schema={schema}
      userID={userId}
      auth={accessToken}
      context={context}
      mutators={mutators}
      init={onReady}
    >
      {guestAccess ? (
        <GuestZeroAuth entry={guestAccess} leave={onSessionExpired} />
      ) : (
        <ZeroAuthRefresh
          onAccessTokenRefreshed={onAccessTokenRefreshed}
          onSessionExpired={onSessionExpired}
        />
      )}
      {children}
    </ZeroProvider>
  );
}
