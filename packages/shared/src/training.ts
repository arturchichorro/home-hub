import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";
import type {
  CatalogExercise,
  WorkoutExercise,
  WorkoutSetValues,
} from "./workouts";
import { workoutSetValuesSchema } from "./workouts";

export const trainingScopeSchema = z
  .object({ householdId: z.uuid(), logId: z.uuid() })
  .strict();

export const saveTrainingSetSchema = trainingScopeSchema
  .extend({
    workoutId: z.uuid().nullable(),
    completedOn: calendarDateSchema,
    timeZone: timeZoneSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
    name: z.string().trim().max(150),
    note: z.string().trim().max(1000000),
    exercises: z
      .array(
        z
          .object({
            id: z.uuid(),
            catalogExerciseId: z.uuid(),
            templateExerciseId: z.uuid().nullable(),
            unit: z.enum(["reps", "seconds"]),
            load: z.enum(["bodyweight", "single", "per-hand"]),
            unilateral: z.boolean(),
            isNew: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(40)
      .refine(
        (rows) =>
          new Set(rows.map((row) => row.id)).size === rows.length &&
          new Set(
            rows.map((row) => row.templateExerciseId ?? row.catalogExerciseId),
          ).size === rows.length,
        "Duplicate exercise identity",
      ),
    sessionExerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
    values: workoutSetValuesSchema,
  })
  .strict();

export const removeTrainingSetSchema = trainingScopeSchema
  .extend({
    sessionExerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
  })
  .strict();

export const removeTrainingExerciseSchema = trainingScopeSchema
  .extend({ sessionExerciseId: z.uuid() })
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
const trainingHistoryCursorSchema = z
  .object({
    completedOn: calendarDateSchema,
    completedAt: z.number().finite(),
    id: z.uuid(),
  })
  .strict();
export const trainingHistoryArgsSchema = z
  .object({
    householdId: z.uuid(),
    workoutId: z.uuid().optional(),
    includeExercises: z.boolean().optional(),
    cursor: trainingHistoryCursorSchema.optional(),
  })
  .strict();

// Local draft key only; persisted occurrences always have their own UUID.
export function logOnlyWorkoutExercise(
  exercise: CatalogExercise,
): WorkoutExercise {
  return {
    ...exercise,
    catalogExerciseId: exercise.id,
    role: "workout",
    sets: 2,
    target: "",
  };
}

export function isCompleteExerciseSet(
  exercise: { load: string; unilateral: boolean },
  values: WorkoutSetValues,
) {
  return (
    (exercise.load === "bodyweight"
      ? values.weightKg === null
      : values.weightKg !== null) &&
    (exercise.unilateral
      ? values.rightAmount !== null
      : values.rightAmount === null)
  );
}

export type SaveTrainingSet = z.infer<typeof saveTrainingSetSchema>;
export type TrainingHistoryCursor = z.infer<typeof trainingHistoryCursorSchema>;
