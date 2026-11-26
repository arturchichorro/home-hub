import * as z from "zod";
import { calendarDateSchema, habitMonth, shiftCalendarDate } from "./habits";

export const cleanCalendarTitle = (s: string) => s.trim().replace(/\s+/gu, " ");

const text = z.string().refine((s) => !s.includes("\u0000"), "Invalid text");
const day = calendarDateSchema.refine((s) => s >= "0001-01-01", "Invalid date");
const validDates = (value: { day: string; endDay: string | null }) =>
  value.endDay === null || value.endDay >= value.day;

export const calendarDatesSchema = z
  .object({ day, endDay: day.nullable() })
  .refine(validDates, "End must be on or after Start");
export const calendarFieldsSchema = calendarDatesSchema.safeExtend({
  title: text.transform(cleanCalendarTitle).pipe(z.string().min(1).max(150)),
  note: text.max(10000),
});
export type CalendarFields = z.infer<typeof calendarFieldsSchema>;
export const calendarScopeSchema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const calendarCreateSchema = calendarScopeSchema
  .extend({
    ...calendarFieldsSchema.shape,
    endDay: calendarFieldsSchema.shape.endDay.default(null),
  })
  .refine(validDates, "End must be on or after Start");
export const calendarUpdateSchema = calendarScopeSchema.extend({
  changes: z
    .object(calendarFieldsSchema.shape)
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0),
});
export const calendarPersonSchema = calendarScopeSchema.extend({
  userId: z.uuid(),
  selected: z.boolean(),
});
export const calendarReorderSchema = calendarScopeSchema.extend({
  day: calendarFieldsSchema.shape.day,
  orderedIds: z
    .array(z.uuid())
    .min(1)
    .max(10000)
    .refine((ids) => new Set(ids).size === ids.length),
});
// Include only the adjacent days needed to complete Monday–Sunday weeks.
export function calendarMonthGrid(anchor: string) {
  const { startOn, dates: monthDates } = habitMonth(anchor);
  const offset = (new Date(`${startOn}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = Math.ceil((offset + monthDates.length) / 7) * 7;
  const dates = Array.from({ length }, (_, index) =>
    shiftCalendarDate(startOn, index - offset),
  ).filter((day) => day >= "0001-01-01" && day <= "9999-12-31");

  return {
    startOn: dates[0] ?? startOn,
    endOn: dates.at(-1) ?? startOn,
    dates,
  };
}

export const calendarRangeSchema = z
  .object({ householdId: z.uuid(), month: calendarFieldsSchema.shape.day })
  .strict()
  .transform(({ householdId, month }) => ({
    householdId,
    ...calendarMonthGrid(month),
  }));
export const calendarItemQuerySchema = z
  .object({ householdId: z.uuid(), itemId: z.uuid() })
  .strict();

export function calendarChanges(
  next: CalendarFields,
  previous: CalendarFields,
): Partial<CalendarFields> {
  const changes: Partial<CalendarFields> = {};
  for (const field of ["title", "note"] as const) {
    if (next[field] !== previous[field]) {
      changes[field] = next[field];
    }
  }
  // Treat the range as one edit, never a pair of independent stale patches.
  if (next.day !== previous.day || next.endDay !== previous.endDay) {
    changes.day = next.day;
    changes.endDay = next.endDay;
  }

  return changes;
}

export function calendarItemIncludesDay(
  item: { day: string; endDay: string | null },
  date: string,
) {
  return item.day <= date && (item.endDay ?? item.day) >= date;
}

export function calendarRangeLabel(item: {
  day: string;
  endDay: string | null;
}) {
  if (!item.endDay || item.endDay === item.day) {
    return undefined;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(
    new Date(`${item.day}T12:00:00Z`),
    new Date(`${item.endDay}T12:00:00Z`),
  );
}
