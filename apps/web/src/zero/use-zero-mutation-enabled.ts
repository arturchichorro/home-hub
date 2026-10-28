import { useConnectionState } from "@rocicorp/zero/react";
import { useUpdateRequired } from "../updates/state";

export function useZeroMutationEnabled() {
  const connectionState = useConnectionState();

  const updateRequired = useUpdateRequired();
  return (
    !updateRequired &&
    (connectionState.name === "connected" ||
      connectionState.name === "connecting")
  );
}
