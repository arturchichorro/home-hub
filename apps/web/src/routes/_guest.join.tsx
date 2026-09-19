import { Button } from "@home-hub/ui-web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ApplicationState } from "../application-state";
import { useGuestAccess } from "../guest/access";

export const Route = createFileRoute("/_guest/join")({
  component: JoinGuestAccess,
});

function JoinGuestAccess() {
  const navigate = useNavigate();
  const { loading, credential, context } = useGuestAccess();

  useEffect(() => {
    if (!loading && credential && context) {
      void navigate({ to: "/recipes", hash: credential, replace: true });
    }
  }, [context, credential, loading, navigate]);

  return loading || (credential && context) ? (
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
