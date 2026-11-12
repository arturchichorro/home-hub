import * as z from "zod";
import { calendarDateSchema, habitMonth } from "./habits";

export const cleanCalendarTitle = (s: string) => s.trim().replace(/\s+/gu, " ");

const text = z.string().refine((s) => !s.includes("\u0000"), "Invalid text");
export const calendarFieldsSchema = z.object({
  title: text.transform(cleanCalendarTitle).pipe(z.string().min(1).max(150)),
  note: text.max(10000),
  day: calendarDateSchema.refine((s) => s >= "0001-01-01", "Invalid date"),
});
export type CalendarFields = z.infer<typeof calendarFieldsSchema>;
export const calendarScopeSchema = z
  .object({
    householdId: z.uuid(),
    itemId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const calendarCreateSchema = calendarScopeSchema.extend(
  calendarFieldsSchema.shape,
);
export const calendarUpdateSchema = calendarScopeSchema.extend({
  changes: calendarFieldsSchema
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
export const calendarRangeSchema = z
  .object({ householdId: z.uuid(), month: calendarFieldsSchema.shape.day })
  .strict()
  .transform(({ householdId, month }) => ({
    householdId,
    ...habitMonth(month),
  }));
export const calendarItemQuerySchema = z
  .object({ householdId: z.uuid(), itemId: z.uuid() })
  .strict();

export function calendarChanges(
  next: CalendarFields,
  previous: CalendarFields,
): Partial<CalendarFields> {
  const changes: Partial<CalendarFields> = {};
  for (const field of ["title", "note", "day"] as const) {
    if (next[field] !== previous[field]) {
      changes[field] = next[field];
    }
  }
  return changes;
}
