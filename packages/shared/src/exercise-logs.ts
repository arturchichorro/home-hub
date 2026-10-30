import * as z from "zod";
import { calendarDateSchema, timeZoneSchema } from "./habits";
import {
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutLogSnapshotSchema,
  workoutSetValuesSchema,
} from "./workouts";

const logScope = {
  householdId: z.uuid(),
  workoutId: z.uuid(),
  logId: z.uuid(),
  workoutExerciseId: z.uuid(),
  round: z.number().int().min(1).max(10),
};
export const saveExerciseSetSchema = z
  .object({
    ...logScope,
    exerciseLogId: z.uuid(),
    snapshot: workoutLogSnapshotSchema.strict(),
    completedOn: calendarDateSchema,
    timeZone: timeZoneSchema,
    optimisticTimestamp: z.number().nonnegative(),
    values: workoutSetValuesSchema,
  })
  .strict();
export const removeExerciseSetSchema = z
  .object({ ...logScope, completedOn: calendarDateSchema.optional() })
  .strict();
export type SaveExerciseSet = z.infer<typeof saveExerciseSetSchema>;
export type RemoveExerciseSet = z.infer<typeof removeExerciseSetSchema>;
export function isCompleteExerciseSet(
  exercise: Pick<WorkoutExercise, "load" | "unilateral">,
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
