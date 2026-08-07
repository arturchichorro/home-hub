import { useConnectionState } from "@rocicorp/zero/react";

export function useZeroMutationEnabled() {
  const connectionState = useConnectionState();

  return (
    connectionState.name === "connected" ||
    connectionState.name === "connecting"
  );
}
