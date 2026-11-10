import { createFileRoute } from "@tanstack/react-router";
import { HabitsPage } from "../habits/habits-page";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/habits/",
)({ component: HabitsRoute });

function HabitsRoute() {
  const { householdId } = Route.useParams();
  const { person, archived } = Route.useSearch();
  return (
    <HabitsPage
      key={householdId}
      householdId={householdId}
      person={person}
      archived={archived}
    />
  );
}
