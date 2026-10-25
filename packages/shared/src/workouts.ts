import * as z from "zod";
import { timeZoneSchema } from "./habits";

const title = z.string().trim().min(1).max(150);
export const workoutExerciseSchema = z
  .object({
    id: z.uuid(),
    name: title,
    sets: z.number().int().min(1).max(10),
    target: z.string().max(100),
    unit: z.enum(["reps", "seconds"]),
    unilateral: z.boolean(),
    load: z.enum(["per-hand", "single", "bodyweight"]),
  })
  .strict();
export const workoutExercisesSchema = z
  .array(workoutExerciseSchema)
  .max(40)
  .refine(
    (rows) => new Set(rows.map((e) => e.id)).size === rows.length,
    "Exercise IDs must be unique",
  );
export const workoutContentSchema = z
  .object({
    title,
    notes: z.string().max(1000000),
    exercises: workoutExercisesSchema,
  })
  .strict();
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type WorkoutContent = z.infer<typeof workoutContentSchema>;
const scope = {
  householdId: z.uuid(),
  workoutId: z.uuid(),
  optimisticTimestamp: z.number().int().nonnegative(),
};
export const reorderWorkoutsSchema = z
  .object({
    ...scope,
    orderedWorkoutIds: z
      .array(z.uuid())
      .min(1)
      .max(500)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Workout IDs must be unique",
      ),
  })
  .strict()
  .refine(
    (args) => args.orderedWorkoutIds.includes(args.workoutId),
    "Order must include the moved workout",
  );
export const createWorkoutSchema = z.object({ ...scope, title }).strict();
export const updateWorkoutSchema = z
  .object({
    ...scope,
    changes: workoutContentSchema
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  })
  .strict();
export const importWorkoutsSchema = z
  .object({
    householdId: z.uuid(),
    workoutIds: z
      .tuple([z.uuid(), z.uuid(), z.uuid()])
      .refine((ids) => new Set(ids).size === 3),
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const workoutSetValuesSchema = z
  .object({
    weightKg: z.number().min(0).max(1000).nullable(),
    amount: z.number().int().min(0).max(600),
    rightAmount: z.number().int().min(0).max(600).nullable(),
  })
  .strict();
export type WorkoutSetValues = z.infer<typeof workoutSetValuesSchema>;
export const workoutLogSetSchema = z
  .object({
    exerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
    values: workoutSetValuesSchema,
  })
  .strict();
export const saveWorkoutLogSchema = z
  .object({
    ...scope,
    logId: z.uuid(),
    snapshot: workoutContentSchema,
    note: z.string().max(1000000),
    timeZone: timeZoneSchema,
    sets: z
      .array(workoutLogSetSchema)
      .max(400)
      .refine(
        (rows) =>
          new Set(rows.map((row) => `${row.exerciseId}:${row.round}`)).size ===
          rows.length,
        "Set keys must be unique",
      ),
  })
  .strict();
