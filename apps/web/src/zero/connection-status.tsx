import { StatusIndicator, type StatusIndicatorVariant } from "@home-hub/ui-web";
import type { ConnectionState } from "@rocicorp/zero";
import { useConnectionState } from "@rocicorp/zero/react";

function getConnectionPresentation(connectionState: ConnectionState): {
  label: string;
  variant: StatusIndicatorVariant;
} {
  switch (connectionState.name) {
    case "connected":
      return { label: "Connected", variant: "success" };
    case "connecting":
      return { label: "Connecting…", variant: "warning" };
    case "disconnected":
      return { label: "Offline", variant: "danger" };
    case "needs-auth":
      return { label: "Authentication required", variant: "danger" };
    case "error":
      return { label: "Synchronization error", variant: "danger" };
    case "closed":
      return { label: "Synchronization stopped", variant: "danger" };
  }
}

type ZeroConnectionStatusProps = {
  compact?: boolean;
};

export function ZeroConnectionStatus({
  compact = false,
}: ZeroConnectionStatusProps) {
  const connectionState = useConnectionState();
  const presentation = getConnectionPresentation(connectionState);

  return (
    <StatusIndicator
      live
      label={presentation.label}
      {...(compact ? { labelClassName: "sr-only" } : {})}
      size="compact"
      variant={presentation.variant}
    />
  );
}
