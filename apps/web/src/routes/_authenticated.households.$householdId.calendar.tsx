import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "../calendar/calendar-page";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/calendar",
)({ component: Page });

function Page() {
  const { householdId } = Route.useParams();
  return <CalendarPage key={householdId} householdId={householdId} />;
}
