import {
  emptyExerciseStats,
  exerciseStatsSchema,
} from "@home-hub/shared/exercise-stats";
import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

export function useExerciseStats(householdId: string, exerciseId: string) {
  const [row, status] = useQuery(
    queries.training.statistics({ householdId, exerciseId }),
  );
  const parsed = row
    ? exerciseStatsSchema.safeParse(
        row.statistics?.[0]?.stats ?? emptyExerciseStats,
      )
    : undefined;
  return {
    data:
      status.type === "complete" && parsed?.success ? parsed.data : undefined,
    error:
      status.type === "error" ||
      (status.type === "complete" && (!row || !parsed?.success))
        ? "Unable to load statistics."
        : undefined,
  };
}
