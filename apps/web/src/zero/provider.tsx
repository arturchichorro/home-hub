import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { mutators } from "@home-hub/shared/zero/mutators";
import { schema } from "@home-hub/shared/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { type ReactNode, useMemo } from "react";
import { ZeroAuthRefresh } from "./zero-auth-refresh";

const cacheURL = import.meta.env.VITE_ZERO_CACHE_URL;

if (!cacheURL) {
  throw new Error("VITE_ZERO_CACHE_URL is not configured");
}

type HomeHubZeroProviderProps = {
  userId: string;
  accessToken: string;
  onAccessTokenRefreshed: (accessToken: string) => void;
  onSessionExpired: () => void;
  onReady: (zero: Zero) => void;
  children: ReactNode;
};

export function HomeHubZeroProvider({
  userId,
  accessToken,
  onAccessTokenRefreshed,
  onSessionExpired,
  onReady,
  children,
}: HomeHubZeroProviderProps) {
  const context = useMemo<ZeroAuthContext>(() => ({ userId }), [userId]);

  return (
    <ZeroProvider
      cacheURL={cacheURL}
      schema={schema}
      userID={userId}
      auth={accessToken}
      context={context}
      mutators={mutators}
      init={onReady}
    >
      <ZeroAuthRefresh
        onAccessTokenRefreshed={onAccessTokenRefreshed}
        onSessionExpired={onSessionExpired}
      />
      {children}
    </ZeroProvider>
  );
}
