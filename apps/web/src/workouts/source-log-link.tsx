import { Pencil } from "@home-hub/ui-web";
import { Link } from "@tanstack/react-router";
import type { TrainingSessionRow } from "./training-log-projection";

export function SourceLogLink({
  log,
}: {
  log: Pick<TrainingSessionRow, "id" | "householdId" | "workoutId">;
}) {
  const props = {
    "aria-label": "Open original log",
    title: "Open original log",
    className:
      "inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-muted outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-focus-ring",
    children: <Pencil aria-hidden="true" className="size-4" />,
  };
  return log.workoutId ? (
    <Link
      {...props}
      to="/households/$householdId/workouts/$workoutId"
      params={{ householdId: log.householdId, workoutId: log.workoutId }}
      search={{ log: log.id }}
    />
  ) : (
    <Link
      {...props}
      to="/households/$householdId/workouts/sessions/$logId"
      params={{ householdId: log.householdId, logId: log.id }}
    />
  );
}
