import { BookOpen } from "@home-hub/ui-web";
import { Link } from "@tanstack/react-router";

export function ExerciseDetailLink({
  householdId,
  exerciseId,
  name,
}: {
  householdId: string;
  exerciseId: string;
  name: string;
}) {
  return (
    <Link
      to="/households/$householdId/workouts/exercises/$exerciseId"
      params={{ householdId, exerciseId }}
      aria-label={`Open ${name} details`}
      title="Exercise details"
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <BookOpen aria-hidden="true" className="size-4" />
    </Link>
  );
}
