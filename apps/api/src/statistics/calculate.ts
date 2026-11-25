import { shiftCalendarDate } from "@home-hub/shared/habits";

function weekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();

  return shiftCalendarDate(day, -((weekday + 6) % 7));
}

// Entries arrive in ascending date order, one row per person/habit/day.
export function habitStatistics(endOn: string) {
  const endWeek = weekStart(endOn);
  const start7 =
    endOn < "0001-01-07" ? "0001-01-01" : shiftCalendarDate(endOn, -6);
  const start30 =
    endOn < "0001-01-30" ? "0001-01-01" : shiftCalendarDate(endOn, -29);
  let completedDays = 0;
  let lastOn: string | null = null;
  let lastWeek: string | undefined;
  let run = 0;
  let bestWeeks = 0;
  let last7 = 0;
  let last30 = 0;

  return {
    add(day: string, completed: boolean) {
      if (!completed) {
        return;
      }

      completedDays++;
      lastOn = day;
      last7 += Number(day >= start7);
      last30 += Number(day >= start30);
      const week = weekStart(day);

      if (week !== lastWeek) {
        run = lastWeek && shiftCalendarDate(lastWeek, 7) === week ? run + 1 : 1;
        bestWeeks = Math.max(bestWeeks, run);
        lastWeek = week;
      }
    },
    finish() {
      const endingWeeks =
        lastWeek &&
        (lastWeek === endWeek || shiftCalendarDate(lastWeek, 7) === endWeek)
          ? run
          : 0;

      return { completedDays, lastOn, last7, last30, endingWeeks, bestWeeks };
    },
  };
}

export type ActualSet = {
  round: number;
  amount: number;
  rightAmount: number | null;
  weightKg: number | null;
  unit: "reps" | "seconds";
  load: "bodyweight" | "single" | "per-hand";
  unilateral: boolean;
};

const measure = () => ({
  total: 0,
  left: 0,
  right: 0,
  sets: 0,
  unilateralSets: 0,
});

export function exerciseStatistics() {
  // The export cursor groups rows by exercise, session and occurrence.
  let sessions = 0;
  let previousSession: string | undefined;
  const reps = measure();
  const seconds = measure();
  const records = new Map<
    string,
    Pick<ActualSet, "unit" | "load" | "unilateral"> & { weightKg: number }
  >();
  let sets = 0;
  let lastOn: string | null = null;
  let volume = 0;
  let measuredSets = 0;
  let unmeasuredSets = 0;

  return {
    add(sessionId: string, performedOn: string, actual: ActualSet) {
      if (sessionId !== previousSession) {
        sessions++;
        previousSession = sessionId;
      }
      sets++;
      lastOn = lastOn === null || performedOn > lastOn ? performedOn : lastOn;
      const totals = actual.unit === "reps" ? reps : seconds;
      const right = actual.unilateral
        ? (actual.rightAmount ?? actual.amount)
        : 0;

      totals.total += actual.amount + right;
      totals.sets++;

      if (actual.unilateral) {
        totals.left += actual.amount;
        totals.right += right;
        totals.unilateralSets++;
      }

      if (actual.load !== "bodyweight" && actual.weightKg !== null) {
        const key = `${actual.unit}:${actual.load}:${actual.unilateral}`;
        const previous = records.get(key);

        if (!previous || actual.weightKg > previous.weightKg) {
          records.set(key, {
            unit: actual.unit,
            load: actual.load,
            unilateral: actual.unilateral,
            weightKg: actual.weightKg,
          });
        }
      }

      if (actual.unit === "reps" && actual.load !== "bodyweight") {
        if (actual.weightKg === null) {
          unmeasuredSets++;
        } else {
          measuredSets++;
          volume +=
            actual.weightKg *
            (actual.load === "per-hand" ? 2 : 1) *
            (actual.amount + right);
        }
      }
    },
    finish() {
      return {
        sessions,
        sets,
        lastOn,
        reps,
        seconds,
        volumeKg: measuredSets ? volume : null,
        unmeasuredSets,
        records: [...records.values()].sort(
          (a, b) =>
            a.unit.localeCompare(b.unit) ||
            a.load.localeCompare(b.load) ||
            Number(a.unilateral) - Number(b.unilateral),
        ),
      };
    },
  };
}
