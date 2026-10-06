import { useConnectionState } from "@rocicorp/zero/react";
import { useEffect } from "react";
import type { GuestEntry } from "./access";
import { validateGuestCredential } from "./access";
export function GuestZeroAuth({
  entry,
  leave,
}: {
  entry: GuestEntry;
  leave: () => void;
}) {
  const connection = useConnectionState();
  useEffect(() => {
    if (connection.name === "needs-auth") leave();
  }, [connection.name, leave]);
  useEffect(() => {
    let active = true;
    const timer = setInterval(() => {
      if (Date.now() >= entry.guest.expiresAt) leave();
    }, 1000);
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void validateGuestCredential(entry.credential)
        .then((result) => {
          if (active && !result) leave();
        })
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [entry, leave]);
  return null;
}
