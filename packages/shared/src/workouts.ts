import * as z from "zod";
import { timeZoneSchema } from "./habits";

const title = z.string().trim().min(1).max(150);
export const workoutExerciseSchema = z
  .object({
    id: z.uuid(),
    catalogExerciseId: z.uuid().optional(),
    name: title,
    sets: z.number().int().min(1).max(10),
    target: z.string().max(100),
    unit: z.enum(["reps", "seconds"]),
    unilateral: z.boolean(),
    load: z.enum(["per-hand", "single", "bodyweight"]),
  })
  .strict();
export const exerciseCatalogSchema = workoutExerciseSchema
  .pick({ name: true, unit: true, load: true, unilateral: true })
  .extend({ id: z.uuid() });
export type CatalogExercise = z.infer<typeof exerciseCatalogSchema>;
export const normalizeExerciseName = (name: string) =>
  name.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
export const createCatalogExerciseSchema = z
  .object({
    householdId: z.uuid(),
    exercise: exerciseCatalogSchema,
    optimisticTimestamp: z.number().int().nonnegative(),
  })
  .strict();
export const updateCatalogExerciseSchema = z
  .object({
    householdId: z.uuid(),
    exerciseId: z.uuid(),
    optimisticTimestamp: z.number().int().nonnegative(),
    changes: workoutExerciseSchema
      .pick({ name: true, unit: true, load: true, unilateral: true })
      .partial()
      .refine((value) => Object.keys(value).length > 0),
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
// Ignore legacy copied notes when reading; new mutation payloads remain strict.
export const workoutLogSnapshotSchema = workoutContentSchema
  .pick({
    title: true,
    exercises: true,
  })
  .strip();
export type WorkoutLogSnapshot = z.infer<typeof workoutLogSnapshotSchema>;
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
      .pick({ title: true, notes: true })
      .partial()
      .refine((v) => Object.keys(v).length > 0),
  })
  .strict();
const workoutExercisePatchSchema = workoutExerciseSchema
  .omit({ id: true })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Exercise changes are required",
  );
export const editWorkoutExercisesSchema = z
  .object({
    ...scope,
    creates: z.array(workoutExerciseSchema).max(40),
    updates: z
      .array(
        z
          .object({ exerciseId: z.uuid(), changes: workoutExercisePatchSchema })
          .strict(),
      )
      .max(40),
    deletes: z.array(z.uuid()).max(40),
  })
  .strict()
  .refine((args) => {
    const ids = [
      ...args.creates.map((e) => e.id),
      ...args.updates.map((e) => e.exerciseId),
      ...args.deletes,
    ];
    return ids.length > 0 && new Set(ids).size === ids.length;
  }, "Exercise operations must be nonempty and unique");
export type WorkoutExerciseEdits = Pick<
  z.infer<typeof editWorkoutExercisesSchema>,
  "creates" | "updates" | "deletes"
>;
export function planExerciseEdits(
  before: readonly WorkoutExercise[],
  after: readonly WorkoutExercise[],
): WorkoutExerciseEdits {
  const old = new Map(before.map((e) => [e.id, e]));
  const nextIds = new Set(after.map((e) => e.id));
  const result: WorkoutExerciseEdits = {
    creates: [],
    updates: [],
    deletes: before.filter((e) => !nextIds.has(e.id)).map((e) => e.id),
  };
  for (const exercise of after) {
    const previous = old.get(exercise.id);
    if (!previous) {
      result.creates.push(exercise);
      continue;
    }
    const { id: _id, ...fields } = exercise;
    const changes = Object.fromEntries(
      Object.entries(fields).filter(
        ([key, value]) => value !== previous[key as keyof WorkoutExercise],
      ),
    );
    if (Object.keys(changes).length)
      result.updates.push({
        exerciseId: exercise.id,
        changes: workoutExercisePatchSchema.parse(changes),
      });
  }
  return result;
}
// Related database rows include scope/order/timestamps; snapshots and form inputs do not.
export function workoutExercisesFromRows(
  rows: readonly {
    id: string;
    exerciseId: string;
    sets: number;
    target: string;
    exercise:
      | {
          id: string;
          name: string;
          unit: string;
          unilateral: boolean;
          load: string;
        }
      | undefined;
  }[],
): WorkoutExercise[] {
  return workoutExercisesSchema.parse(
    rows.map((row) => {
      if (!row.exercise) throw new Error("Missing catalog exercise");
      return {
        id: row.id,
        catalogExerciseId: row.exercise.id,
        name: row.exercise.name,
        unit: row.exercise.unit,
        load: row.exercise.load,
        unilateral: row.exercise.unilateral,
        sets: row.sets,
        target: row.target,
      };
    }),
  );
}
export function workoutSetValuesFromRow(row: {
  amount: number;
  rightAmount: number | null;
  weightKg: number | null;
}) {
  return workoutSetValuesSchema.parse({
    amount: row.amount,
    rightAmount: row.rightAmount,
    weightKg: row.weightKg,
  });
}
export const importWorkoutsSchema = z
  .object({
    householdId: z.uuid(),
    catalogExerciseIds: z.array(z.uuid()).min(1).max(40),
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
    workoutExerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
    values: workoutSetValuesSchema,
  })
  .strict();
export const updateWorkoutLogNoteSchema = z
  .object({
    householdId: z.uuid(),
    workoutId: z.uuid(),
    logId: z.uuid(),
    note: z.string().trim().max(1000000),
  })
  .strict();
export const saveWorkoutLogSchema = z
  .object({
    ...scope,
    logId: z.uuid(),
    snapshot: workoutLogSnapshotSchema.strict(),
    note: z.string().max(1000000).optional(),
    timeZone: timeZoneSchema,
    sets: z
      .array(workoutLogSetSchema)
      .max(400)
      .refine(
        (rows) =>
          new Set(rows.map((row) => `${row.workoutExerciseId}:${row.round}`))
            .size === rows.length,
        "Set keys must be unique",
      ),
  })
  .strict();
