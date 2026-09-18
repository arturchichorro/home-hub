import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { mutators } from "@home-hub/shared/zero/mutators";
import { schema } from "@home-hub/shared/zero/schema";
import type { Zero } from "@rocicorp/zero";
import { ZeroProvider } from "@rocicorp/zero/react";
import { type ReactNode, useMemo } from "react";
import { ModuleAccessProvider } from "../access/module-access";
import { ZeroAuthRefresh } from "./zero-auth-refresh";

const cacheURL = import.meta.env.VITE_ZERO_CACHE_URL;

if (!cacheURL) {
  throw new Error("VITE_ZERO_CACHE_URL is not configured");
}

type HomeHubZeroProviderProps = {
  cacheIdentity: string;
  canWrite: boolean;
  guest?: ZeroAuthContext["guest"];
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
  guest,
  accessToken,
  onAccessTokenRefreshed,
  refreshAccessToken,
  onSessionExpired,
  onReady,
  children,
}: HomeHubZeroProviderProps) {
  const context = useMemo<ZeroAuthContext>(
    () => ({ userId: cacheIdentity, ...(guest ? { guest } : {}) }),
    [cacheIdentity, guest],
  );

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
