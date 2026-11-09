import * as z from "zod";
import { calendarDateSchema } from "./habits";

const count = z.number().int().nonnegative().finite();
const measure = z
  .object({
    total: count,
    left: count,
    right: count,
    sets: count,
    unilateralSets: count,
  })
  .strict();

export const exerciseStatsSchema = z
  .object({
    sessions: count,
    sets: count,
    lastOn: calendarDateSchema.nullable(),
    reps: measure,
    seconds: measure,
    volumeKg: z.number().nonnegative().finite().nullable(),
    unmeasuredSets: count,
    records: z
      .array(
        z
          .object({
            unit: z.enum(["reps", "seconds"]),
            load: z.enum(["single", "per-hand"]),
            unilateral: z.boolean(),
            weightKg: z.number().nonnegative().finite(),
          })
          .strict(),
      )
      .max(8),
  })
  .strict();

export type ExerciseStats = z.infer<typeof exerciseStatsSchema>;
