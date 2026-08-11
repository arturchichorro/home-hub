import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect, useState } from "react";
import { refreshAccessToken } from "../auth/api";

const initialRefreshRetryDelayMilliseconds = 5_000;
const maximumRefreshRetryDelayMilliseconds = 30_000;

type ZeroAuthRefreshProps = {
  onAccessTokenRefreshed: (accessToken: string) => void;
  onSessionExpired: () => void;
};

export function ZeroAuthRefresh({
  onAccessTokenRefreshed,
  onSessionExpired,
}: ZeroAuthRefreshProps) {
  const connectionState = useConnectionState();
  const [retryAttempt, setRetryAttempt] = useState(0);

  useEffect(() => {
    if (connectionState.name !== "needs-auth" && retryAttempt !== 0) {
      setRetryAttempt(0);
    }
  }, [connectionState.name, retryAttempt]);

  useEffect(() => {
    if (connectionState.name !== "needs-auth") return;

    let active = true;
    let retryTimer: number | undefined;
    const retryDelayMilliseconds = Math.min(
      initialRefreshRetryDelayMilliseconds * 2 ** retryAttempt,
      maximumRefreshRetryDelayMilliseconds,
    );

    void refreshAccessToken()
      .then((result) => {
        if (!active) return;

        if (result.kind === "unauthorized") {
          onSessionExpired();
          return;
        }

        onAccessTokenRefreshed(result.accessToken);
      })
      .catch(() => {
        if (!active) return;

        retryTimer = window.setTimeout(() => {
          setRetryAttempt((attempt) => attempt + 1);
        }, retryDelayMilliseconds);
      });

    return () => {
      active = false;

      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [
    connectionState.name,
    onAccessTokenRefreshed,
    onSessionExpired,
    retryAttempt,
  ]);

  return null;
}
