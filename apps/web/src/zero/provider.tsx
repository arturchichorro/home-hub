import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { mutators } from "@home-hub/shared/zero/mutators";
import { schema } from "@home-hub/shared/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { type ReactNode, useMemo } from "react";
import { ModuleAccessProvider } from "../access/module-access";
import { ZeroAuthRefresh } from "./zero-auth-refresh";

const configuredCacheURL = import.meta.env.VITE_ZERO_CACHE_URL;

if (!configuredCacheURL) {
  throw new Error("VITE_ZERO_CACHE_URL is not configured");
}

const cacheURL = new URL(configuredCacheURL, window.location.origin).href;

type HomeHubZeroProviderProps = {
  cacheIdentity: string;
  canWrite: boolean;
  requestAccess: ZeroAuthContext;
  accessToken: string;
  onAccessTokenRefreshed: (accessToken: string) => void;
  refreshAccessToken?: () => Promise<
    { kind: "success"; accessToken: string } | { kind: "unauthorized" }
  >;
  onSessionExpired: () => void;
  onReady: (zero: Zero) => void;
  children: ReactNode;
};

export function HomeHubZeroProvider({
  cacheIdentity,
  canWrite,
  requestAccess,
  accessToken,
  onAccessTokenRefreshed,
  refreshAccessToken,
  onSessionExpired,
  onReady,
  children,
}: HomeHubZeroProviderProps) {
  const context = useMemo(() => requestAccess, [requestAccess]);

  return (
    <ZeroProvider
      cacheURL={cacheURL}
      schema={schema}
      userID={cacheIdentity}
      auth={accessToken}
      context={context}
      mutators={mutators}
      init={onReady}
    >
      <ZeroAuthRefresh
        {...(refreshAccessToken ? { refreshAccessToken } : {})}
        onAccessTokenRefreshed={onAccessTokenRefreshed}
        onSessionExpired={onSessionExpired}
      />
      <ModuleAccessProvider canWrite={canWrite}>
        {children}
      </ModuleAccessProvider>
    </ZeroProvider>
  );
}
