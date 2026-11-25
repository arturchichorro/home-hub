import { habitStatsFromWeeks } from "@home-hub/shared/habit-stats";
import { queries } from "@home-hub/shared/zero/queries";
import { useQuery } from "@rocicorp/zero/react";

export function useHabitStats(
  householdId: string,
  habitId: string,
  personId: string,
  today: string,
  enabled: boolean,
) {
  const [row, status] = useQuery(
    enabled
      ? queries.habits.statistics({
          householdId,
          habitId,
          personId,
          today,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
      : undefined,
  );
  const error =
    enabled &&
    (status.type === "error" || (status.type === "complete" && !row));
  return {
    data:
      row && status.type === "complete"
        ? habitStatsFromWeeks(today, row.weeklyStatistics)
        : undefined,
    error: error ? "Unable to load statistics." : undefined,
  };
}
