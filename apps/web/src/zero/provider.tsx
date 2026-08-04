import type { ZeroAuthContext } from "@home-hub/shared/zero/context";
import { schema } from "@home-hub/shared/zero/schema";
import { ZeroProvider } from "@rocicorp/zero/react";
import type { ReactNode } from "react";

const cacheURL = import.meta.env.VITE_ZERO_CACHE_URL;

if (!cacheURL) {
  throw new Error("VITE_ZERO_CACHE_URL is not configured");
}

type HomeHubZeroProviderProps = {
  userId: string;
  accessToken: string;
  children: ReactNode;
};

export function HomeHubZeroProvider({
  userId,
  accessToken,
  children,
}: HomeHubZeroProviderProps) {
  const context: ZeroAuthContext = { userId };

  return (
    <ZeroProvider
      cacheURL={cacheURL}
      schema={schema}
      userID={userId}
      auth={accessToken}
      context={context}
    >
      {children}
    </ZeroProvider>
  );
}
