import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";

const count = z.number().int().nonnegative().finite();
export const habitStatsRequestSchema = z
  .object({
    personId: z.uuid(),
    timeZone: timeZoneSchema,
  })
  .strict();
export const habitStatsSchema = z
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
export const habitViewSearchSchema = z.object({
  person: z.uuid().optional(),
  archived: z.boolean().optional(),
});
