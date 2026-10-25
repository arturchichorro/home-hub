import * as z from "zod";
import {
  calendarDateSchema,
  shiftCalendarDate,
  timeZoneSchema,
} from "./habits";

const name = z.string().trim().min(1).max(150);
const instructions = z.string().max(8000);
export const workoutExerciseSchema = z
  .object({
    id: z.uuid(),
    name,
    pair: z.number().int().min(1).max(20),
    sets: z.number().int().min(1).max(10),
    min: z.number().int().min(1).max(600),
    max: z.number().int().min(1).max(600),
    unit: z.enum(["reps", "seconds"]),
    unilateral: z.boolean(),
    load: z.enum(["per-hand", "single", "bodyweight"]),
    cues: instructions,
  })
  .strict()
  .refine((e) => e.max >= e.min, "Maximum must be at least minimum");
export const workoutSchema = z
  .object({
    id: z.uuid(),
    name,
    exercises: z.array(workoutExerciseSchema).min(1).max(40),
  })
  .strict()
  .refine(
    (w) => new Set(w.exercises.map((e) => e.id)).size === w.exercises.length,
    "Exercise IDs must be unique",
  );
export const workoutPlanSchema = z
  .object({
    warmup: instructions,
    finish: instructions,
    guidance: instructions,
    incrementKg: z.number().positive().max(100).nullable(),
    workouts: z.array(workoutSchema).min(1).max(14),
  })
  .strict()
  .refine(
    (p) => new Set(p.workouts.map((w) => w.id)).size === p.workouts.length,
    "Workout IDs must be unique",
  );
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type WorkoutPlan = z.infer<typeof workoutPlanSchema>;
export const workoutSnapshotSchema = z
  .object({
    workout: workoutSchema,
    warmup: instructions,
    finish: instructions,
    guidance: instructions,
    incrementKg: z.number().positive().max(100).nullable(),
  })
  .strict();
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>;
const scope = {
  householdId: z.uuid(),
  optimisticTimestamp: z.number().int().nonnegative(),
};
export const saveWorkoutPlanSchema = z
  .object({
    ...scope,
    planId: z.uuid(),
    title: name,
    definition: workoutPlanSchema,
    create: z.boolean(),
  })
  .strict();
export const startWorkoutCycleSchema = z
  .object({
    ...scope,
    cycleId: z.uuid(),
    planId: z.uuid(),
    timeZone: timeZoneSchema,
  })
  .strict();
export const startWorkoutSessionSchema = z
  .object({
    ...scope,
    sessionId: z.uuid(),
    cycleId: z.uuid(),
    lowEnergy: z.boolean(),
    timeZone: timeZoneSchema,
  })
  .strict();
export const workoutSessionActionSchema = z
  .object({
    ...scope,
    sessionId: z.uuid(),
    action: z.enum(["complete", "abandon", "note"]),
    note: z.string().max(1000),
    timeZone: timeZoneSchema,
  })
  .strict();
export const workoutSetValuesSchema = z
  .object({
    weightKg: z.number().min(0).max(1000).nullable(),
    amount: z.number().int().min(0).max(600),
    skipped: z.boolean().default(false),
    rightAmount: z.number().int().min(1).max(600).nullable(),
    rir: z.number().int().min(0).max(10).nullable(),
    goodForm: z.boolean(),
    note: z.string().max(500),
  })
  .strict()
  .refine(
    (v) => (v.skipped ? v.note.trim().length > 0 : v.amount > 0),
    "Skipped sets need a reason; performed sets need a positive amount.",
  );
export const saveWorkoutSetSchema = z
  .object({
    ...scope,
    sessionId: z.uuid(),
    exerciseId: z.uuid(),
    round: z.number().int().min(1).max(10),
    values: workoutSetValuesSchema,
  })
  .strict();
export type WorkoutSetValues = z.infer<typeof workoutSetValuesSchema>;
export type LoggedWorkoutSet = WorkoutSetValues & {
  exerciseId: string;
  round: number;
};

export function nextWorkout(
  plan: WorkoutPlan,
  lastWorkoutId?: string,
): Workout {
  const index = plan.workouts.findIndex((w) => w.id === lastWorkoutId);
  return plan.workouts[(index + 1) % plan.workouts.length] as Workout;
}
export function progressionSuggestion(
  exercise: WorkoutExercise,
  sets: readonly LoggedWorkoutSet[],
  incrementKg: number | null,
): string {
  const rows = sets.filter((s) => s.exerciseId === exercise.id);
  if (
    rows.length !== exercise.sets ||
    !Array.from({ length: exercise.sets }, (_, i) =>
      rows.some((s) => s.round === i + 1),
    ).every(Boolean)
  )
    return "Build repetitions with 2–3 clean reps in reserve.";
  if (
    !rows.every(
      (s) =>
        !s.skipped &&
        s.amount >= exercise.max &&
        (!exercise.unilateral || (s.rightAmount ?? s.amount) >= exercise.max) &&
        s.goodForm &&
        s.rir !== null &&
        s.rir >= 2,
    )
  )
    return "Keep the load; build controlled repetitions without symptoms.";
  if (exercise.unit === "seconds")
    return "Target reached on both sides. Consider a harder variation when comfortable.";
  if (exercise.load === "bodyweight")
    return "Target reached. Consider a harder variation when comfortable.";
  const weight = rows[0]?.weightKg;
  if (weight == null || !rows.every((s) => s.weightKg === weight))
    return "Use the same comfortable load across both sets before increasing.";
  return incrementKg === null
    ? "Consider the smallest available weight increase next time, only if manageable; return to the bottom of the range."
    : `Consider ${weight + incrementKg} kg next time, only if the jump is manageable; return to ${exercise.min} reps.`;
}
export function workoutWeekStart(today: string): string {
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  return shiftCalendarDate(today, -((day + 6) % 7));
}
export function cycleWeek(startedOn: string, today: string): number {
  return Math.max(
    1,
    Math.floor(
      (Date.parse(`${today}T12:00:00Z`) -
        Date.parse(`${startedOn}T12:00:00Z`)) /
        604800000,
    ) + 1,
  );
}
export { calendarDateSchema };
