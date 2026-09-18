import { useConnectionState } from "@rocicorp/zero/react";
import { useModuleAccess } from "../access/module-access";

export function useZeroMutationEnabled() {
  const connectionState = useConnectionState();
  const { canWrite } = useModuleAccess();

  return (
    (canWrite && connectionState.name === "connected") ||
    (canWrite && connectionState.name === "connecting")
  );
}
