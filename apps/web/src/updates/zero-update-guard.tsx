import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect } from "react";
import { useBlockAppUpdate } from "./activity";
import { appUpdates, useUpdateRequired } from "./state";
export function ZeroUpdateGuard() {
  const connection = useConnectionState();
  const required = useUpdateRequired();
  useEffect(() => {
    if (connection.name === "connected") void appUpdates.check();
  }, [connection.name]);
  useBlockAppUpdate(!required && connection.name !== "connected");
  return null;
}
