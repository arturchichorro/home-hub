import * as z from "zod";

export const calendarDateSchema = z.iso.date();
export function cleanHabitName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}
export const habitNameSchema = z
  .string()
  .transform(cleanHabitName)
  .pipe(z.string().min(1).max(100));

export const timeZoneSchema = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone");

export function calendarDate(now: number | Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// UTC arithmetic is only for date labels, never for assigning an instant to a day.
export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function habitMonth(anchor: string) {
  const date = new Date(`${anchor}T12:00:00Z`);
  const startOn = `${anchor.slice(0, 7)}-01`;
  const length = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dates = Array.from({ length }, (_, index) =>
    shiftCalendarDate(startOn, index),
  );
  return { startOn, endOn: shiftCalendarDate(startOn, length - 1), dates };
}

export function clampHabitMonth(anchor: string, today: string): string {
  const month = anchor.slice(0, 7) > today.slice(0, 7) ? today : anchor;
  return `${month.slice(0, 7)}-01`;
}

export function adjacentHabitMonth(anchor: string, direction: -1 | 1): string {
  const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}

const scope = { householdId: z.uuid(), habitId: z.uuid() };
const timestamp = z.number().int().nonnegative();
export const createHabitMutationSchema = z
  .object({
    ...scope,
    name: habitNameSchema,
    timeZone: timeZoneSchema,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const reorderHabitsMutationSchema = z
  .object({
    ...scope,
    orderedHabitIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Ordered IDs must be unique",
      ),
    optimisticTimestamp: timestamp,
  })
  .strict()
  .refine(
    (args) => args.orderedHabitIds.includes(args.habitId),
    "Order must contain the moved habit",
  );

export const renameHabitMutationSchema = z
  .object({
    ...scope,
    name: habitNameSchema,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const archiveHabitMutationSchema = z
  .object({
    ...scope,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const setHabitCompletedMutationSchema = z
  .object({
    ...scope,
    completedOn: calendarDateSchema,
    completed: z.boolean(),
    timeZone: timeZoneSchema,
    optimisticTimestamp: timestamp,
  })
  .strict();
export const habitsQuerySchema = z
  .object({
    householdId: z.uuid(),
    startOn: calendarDateSchema,
    endOn: calendarDateSchema,
    archived: z.boolean(),
  })
  .strict()
  .refine(
    (args) =>
      args.endOn >= args.startOn &&
      args.endOn <= shiftCalendarDate(args.startOn, 30),
    "Invalid calendar period",
  );
