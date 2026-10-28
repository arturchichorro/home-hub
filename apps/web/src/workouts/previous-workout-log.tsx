import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useEffect, useRef } from "react";
import type { WorkoutLog } from "./workout-log";

// Only mounted while logging. Find the exact previous matching exercise even if
// its log is outside the visible history window or uses an old/deleted slot.
export function PreviousWorkoutLog({
  householdId,
  workoutId,
  exerciseId,
  excludeId,
  before,
  onResult,
}: {
  householdId: string;
  workoutId: string;
  exerciseId: string;
  excludeId: string;
  before: number;
  onResult: (
    exerciseId: string,
    log: WorkoutLog | undefined,
    failed: boolean,
  ) => void;
}) {
  const [rows, result] = useQuery(
    queries.workouts.previousLog({
      householdId,
      workoutId,
      exerciseId,
      excludeId,
      before,
    }),
  );
  const callback = useRef(onResult);
  callback.current = onResult;
  useEffect(() => {
    if (result.type !== "unknown")
      callback.current(exerciseId, rows[0], result.type === "error");
  }, [exerciseId, rows, result.type]);
  return null;
}
