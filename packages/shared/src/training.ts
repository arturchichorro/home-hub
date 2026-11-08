import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";
import { workoutExerciseSchema, workoutSetValuesSchema } from "./workouts";

export const trainingScopeSchema = z
  .object({ householdId: z.uuid(), logId: z.uuid() })
  .strict();
export const saveTrainingSetSchema = trainingScopeSchema
  .extend({
    completedOn: calendarDateSchema,
    timeZone: timeZoneSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
    name: z.string().trim().max(150),
    note: z.string().trim().max(1000000),
    exercises: z
      .array(
        z
          .object({
            exercise: workoutExerciseSchema,
            exerciseLogId: z.uuid(),
            isNew: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(40)
      .refine(
        (rows) =>
          new Set(rows.map((row) => row.exercise.id)).size === rows.length &&
          new Set(rows.map((row) => row.exerciseLogId)).size === rows.length,
        "Duplicate exercise identity",
      ),
    exerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
    values: workoutSetValuesSchema,
  })
  .strict();
export const removeTrainingSetSchema = trainingScopeSchema
  .extend({
    exerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
  })
  .strict();
export const removeTrainingExerciseSchema = trainingScopeSchema
  .extend({ exerciseId: z.uuid() })
  .strict();
export const deleteTrainingSessionSchema = trainingScopeSchema
  .extend({ optimisticTimestamp: z.number().int().nonnegative() })
  .strict();
export const updateTrainingSessionSchema = trainingScopeSchema
  .extend({
    changes: z
      .object({
        name: z.string().trim().max(150).optional(),
        note: z.string().trim().max(1000000).optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, "No changes"),
  })
  .strict();
export const trainingLogSearchSchema = z.object({ log: z.uuid().optional() });
export const trainingHistoryPageSize = 20;
export const trainingHistoryArgsSchema = z
  .object({
    householdId: z.uuid(),
    cursor: z
      .object({
        completedOn: calendarDateSchema,
        completedAt: z.number().finite(),
        id: z.uuid(),
        kind: z.enum(["workout", "free"]),
      })
      .strict()
      .optional(),
  })
  .strict();
export type SaveTrainingSet = z.infer<typeof saveTrainingSetSchema>;
type HistoryPosition = {
  kind: "workout" | "free";
  log: { completedOn: string; completedAt: number; id: string };
};
export function compareTrainingHistory(a: HistoryPosition, b: HistoryPosition) {
  return (
    b.log.completedOn.localeCompare(a.log.completedOn) ||
    b.log.completedAt - a.log.completedAt ||
    b.log.id.localeCompare(a.log.id) ||
    (a.kind === b.kind ? 0 : a.kind === "workout" ? -1 : 1)
  );
}

export type TrainingHistoryCursor = NonNullable<
  z.infer<typeof trainingHistoryArgsSchema>["cursor"]
>;
