import { useConnectionState } from "@rocicorp/zero/react";
import { useGuestAccess } from "../guest-access/context";

export function useZeroMutationEnabled() {
  const guest = useGuestAccess();
  const connectionState = useConnectionState();

  return (
    (!guest || guest.guest.access === "write") &&
    (connectionState.name === "connected" ||
      connectionState.name === "connecting")
  );
}
