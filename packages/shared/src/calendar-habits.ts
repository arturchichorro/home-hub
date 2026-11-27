import * as z from "zod";
import { calendarScopeSchema } from "./calendar";
import { timeZoneSchema } from "./habits";

export const calendarHabitSchema = calendarScopeSchema
  .extend({
    habitId: z.uuid().nullable(),
    timeZone: timeZoneSchema.refine(
      (zone) => !/^[+-]/.test(zone),
      "Use an IANA timezone",
    ),
    confirmArchived: z.boolean().optional(),
  })
  .strict();
