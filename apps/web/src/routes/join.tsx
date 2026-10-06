import { createFileRoute, Navigate } from "@tanstack/react-router";
import { ApplicationState } from "../application-state";
export const Route = createFileRoute("/join")({ component: Join });
function Join() {
  const { guestAccess } = Route.useRouteContext();
  if (guestAccess)
    return (
      <Navigate
        to="/households/$householdId"
        params={{ householdId: guestAccess.guest.householdId }}
        replace
      />
    );
  return (
    <ApplicationState
      actions={null}
      title="Guest access"
      description="Open a Guest access link or scan its QR code. If a link no longer works, ask the household owner for a new one."
    />
  );
}
