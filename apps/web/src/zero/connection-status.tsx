import type { ConnectionState } from "@rocicorp/zero";
import { useConnectionState } from "@rocicorp/zero/react";

function getConnectionLabel(connectionState: ConnectionState): string {
  switch (connectionState.name) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting…";
    case "disconnected":
      return "Offline";
    case "needs-auth":
      return "Authentication required";
    case "error":
      return "Synchronization error";
    case "closed":
      return "Synchronization stopped";
  }
}

export function ZeroConnectionStatus() {
  const connectionState = useConnectionState();

  return <p role="status">{getConnectionLabel(connectionState)}</p>;
}
