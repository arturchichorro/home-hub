import { Button } from "@home-hub/ui-web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApplicationState } from "../application-state";
import { redeemGuestAccess } from "../guest/api";
import { useGuestSession } from "../guest/session";

export const Route = createFileRoute("/_guest/join")({
  component: JoinGuestAccess,
});

function JoinGuestAccess() {
  const navigate = useNavigate();
  const { setSession } = useGuestSession();
  const [status, setStatus] = useState<"joining" | "unavailable">("joining");

  useEffect(() => {
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", "/join");
    if (!token) {
      setStatus("unavailable");
      return;
    }

    let active = true;
    void redeemGuestAccess(token)
      .then((result) => {
        if (!active) return;
        if (result.kind === "unavailable") {
          setStatus("unavailable");
          return;
        }
        setSession(result.session);
        void navigate({ to: "/recipes", replace: true });
      })
      .catch(() => {
        if (active) setStatus("unavailable");
      });
    return () => {
      active = false;
    };
  }, [navigate, setSession]);

  return status === "joining" ? (
    <ApplicationState
      title="Opening household…"
      description="Checking this Guest access link."
      actions={null}
    />
  ) : (
    <ApplicationState
      title="Guest access unavailable"
      description="This QR code is invalid or is no longer active. Ask the household owner for a current one."
      role="alert"
      actions={
        <Button onClick={() => window.location.reload()}>Try again</Button>
      }
    />
  );
}
