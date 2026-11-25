import * as z from "zod";
import {
  calendarDateSchema,
  shiftCalendarDate,
  timeZoneSchema,
} from "./habits";

const count = z.number().int().nonnegative().finite();

export const habitStatisticsArgsSchema = z
  .object({
    householdId: z.uuid(),
    habitId: z.uuid(),
    personId: z.uuid(),
    today: calendarDateSchema,
    timeZone: timeZoneSchema,
  })
  .strict();

const habitStatsSchema = z
  .object({
    asOf: calendarDateSchema,
    completedDays: count,
    lastOn: calendarDateSchema.nullable(),
    currentWeeks: count,
    bestWeeks: count,
    last7: count.max(7),
    last30: count.max(30),
  })
  .strict();

export type HabitStats = z.infer<typeof habitStatsSchema>;

export type HabitWeekStatistics = {
  weekOn: string;
  completedMask: number;
  // Prefix counters through this week, not a rolling-window approximation.
  completedDays: number;
  lastOn: string;
  runLength: number;
  bestWeeks: number;
};

export function habitWeekStart(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();

  return shiftCalendarDate(day, -((weekday + 6) % 7));
}

export function habitStatsFromWeeks(
  today: string,
  rows: readonly HabitWeekStatistics[],
): HabitStats {
  const week = habitWeekStart(today);
  const ordered = [...rows]
    .filter((row) => row.weekOn <= week)
    .sort((a, b) => b.weekOn.localeCompare(a.weekOn));
  const previous = ordered.find((row) => row.weekOn < week);
  const current = ordered.find((row) => row.weekOn === week);
  const currentDays: string[] = [];

  // Clamp rolling windows at the supported calendar minimum.
  const start7 =
    today < "0001-01-07" ? "0001-01-01" : shiftCalendarDate(today, -6);
  const start30 =
    today < "0001-01-30" ? "0001-01-01" : shiftCalendarDate(today, -29);
  let last7 = 0;
  let last30 = 0;

  for (const row of ordered) {
    for (let offset = 0; offset < 7; offset++) {
      if (!(row.completedMask & (1 << offset))) {
        continue;
      }

      const day = shiftCalendarDate(row.weekOn, offset);

      if (day > today) {
        continue;
      }

      if (row === current) {
        currentDays.push(day);
      }
      if (day >= start7) {
        last7++;
      }
      if (day >= start30) {
        last30++;
      }
    }
  }

  const contiguous = previous && shiftCalendarDate(previous.weekOn, 7) === week;
  const priorRun = contiguous ? previous.runLength : 0;
  const currentWeeks = currentDays.length > 0 ? priorRun + 1 : priorRun;

  return habitStatsSchema.parse({
    asOf: today,
    completedDays: (previous?.completedDays ?? 0) + currentDays.length,
    lastOn: currentDays.at(-1) ?? previous?.lastOn ?? null,
    currentWeeks,
    bestWeeks: Math.max(
      previous?.bestWeeks ?? 0,
      currentDays.length ? currentWeeks : 0,
    ),
    last7,
    last30,
  });
}

export const habitViewSearchSchema = z.object({
  person: z.uuid().optional(),
  archived: z.boolean().optional(),
});
