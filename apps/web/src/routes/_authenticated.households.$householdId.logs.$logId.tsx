import { createFileRoute } from "@tanstack/react-router";
import { LogDetail } from "../logs/log-detail";
export const Route = createFileRoute(
  "/_authenticated/households/$householdId/logs/$logId",
)({ component: Page });
function Page() {
  const { householdId, logId } = Route.useParams(),
    { session, onSessionExpired } = Route.useRouteContext();
  return (
    <LogDetail
      key={householdId + logId}
      householdId={householdId}
      logId={logId}
      session={{
        accessToken: session.accessToken,
        userId: session.user.id,
        onSessionExpired,
      }}
    />
  );
}
