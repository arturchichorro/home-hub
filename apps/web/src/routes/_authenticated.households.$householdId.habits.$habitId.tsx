import { createFileRoute } from "@tanstack/react-router";
import { HabitDetailPage } from "../habits/habit-detail";

export const Route = createFileRoute(
  "/_authenticated/households/$householdId/habits/$habitId",
)({ component: HabitRoute });

function HabitRoute() {
  const { householdId, habitId } = Route.useParams();
  const { person } = Route.useSearch();
  return (
    <HabitDetailPage
      key={`${householdId}:${habitId}`}
      householdId={householdId}
      habitId={habitId}
      person={person}
    />
  );
}
