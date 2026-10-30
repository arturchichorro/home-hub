import { isCompleteExerciseSet } from "@home-hub/shared/exercise-logs";
import { calendarDate } from "@home-hub/shared/habits";
import {
  type WorkoutExercise,
  type WorkoutLogSnapshot,
  type WorkoutSetValues,
  workoutLogSnapshotSchema,
  workoutSetValuesFromRow,
  workoutSetValuesSchema,
} from "@home-hub/shared/workouts";
import type { WorkoutLog } from "./workout-log";

export type WorkoutSetInput = {
  weightKg: string;
  amount: string;
  rightAmount: string;
};
export type WorkoutSetInputs = Record<string, WorkoutSetInput>;
export type WorkoutLogForm = {
  id: string;
  snapshot: WorkoutLogSnapshot;
  inputs: WorkoutSetInputs;
  completedAt: number | null;
  completedOn: string | null;
  startedAt?: number;
  exerciseLogIds?: Record<string, string>;
};
export const setInputKey = (exerciseId: string, round: number) =>
  `${exerciseId}:${round}`;
export function completeSetValues(
  exercise: WorkoutExercise,
  input: WorkoutSetInput | undefined,
): WorkoutSetValues | undefined {
  if (!input) return;
  const parsed = workoutSetValuesSchema.safeParse({
    amount: input.amount.trim() === "" ? null : Number(input.amount),
    weightKg:
      exercise.load === "bodyweight" || input.weightKg.trim() === ""
        ? null
        : Number(input.weightKg),
    rightAmount:
      !exercise.unilateral || input.rightAmount.trim() === ""
        ? null
        : Number(input.rightAmount),
  });
  return parsed.success && isCompleteExerciseSet(exercise, parsed.data)
    ? parsed.data
    : undefined;
}
export function exerciseRounds(
  exercise: WorkoutExercise,
  inputs: WorkoutSetInputs,
) {
  return Array.from(
    { length: exerciseRoundCount(exercise, inputs) },
    (_, i) => i + 1,
  ).filter(
    (round) =>
      round <= exercise.sets || setInputKey(exercise.id, round) in inputs,
  );
}
export function exerciseRoundCount(
  exercise: WorkoutExercise,
  inputs: WorkoutSetInputs,
) {
  return Math.min(
    10,
    Math.max(
      exercise.sets,
      ...Object.keys(inputs)
        .filter((key) => key.startsWith(`${exercise.id}:`))
        .map((key) => Number(key.slice(exercise.id.length + 1)) || 0),
    ),
  );
}
export function findDailyWorkoutLog(
  logs: readonly WorkoutLog[],
  now: number,
  timeZone: string,
): WorkoutLog | undefined {
  const day = calendarDate(now, timeZone);
  return logs.find((log) => log.completedOn === day);
}
export function openWorkoutLog(
  workout: WorkoutLogSnapshot,
  existing?: WorkoutLog,
): WorkoutLogForm {
  return {
    id: existing?.id ?? crypto.randomUUID(),
    snapshot: existing
      ? workoutLogSnapshotSchema.parse(existing.snapshot)
      : workoutLogSnapshotSchema.parse({
          title: workout.title,
          exercises: workout.exercises,
        }),
    completedAt: existing?.completedAt ?? null,
    completedOn: existing?.completedOn ?? null,
    startedAt: Date.now(),
    exerciseLogIds: Object.fromEntries(
      workout.exercises.map((exercise) => [
        exercise.id,
        existing?.exerciseLogIds?.[exercise.id] ?? crypto.randomUUID(),
      ]),
    ),
    inputs: Object.fromEntries(
      (existing?.sets ?? []).map((set) => {
        const values = workoutSetValuesFromRow(set);
        return [
          setInputKey(set.workoutExerciseId, set.round),
          {
            weightKg: values.weightKg === null ? "" : String(values.weightKg),
            amount: String(values.amount),
            rightAmount:
              values.rightAmount === null
                ? set.unilateral
                  ? String(values.amount)
                  : ""
                : String(values.rightAmount),
          },
        ];
      }),
    ),
  };
}
