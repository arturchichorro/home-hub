import { calendarDate } from "@home-hub/shared/habits";
import {
  type WorkoutExercise,
  type WorkoutLogSnapshot,
  type WorkoutSetValues,
  workoutLogSnapshotSchema,
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
  note: string;
  inputs: WorkoutSetInputs;
  completedAt: number | null;
  completedOn: string | null;
};
export const setInputKey = (exerciseId: string, round: number) =>
  `${exerciseId}:${round}`;
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
    note: existing?.note ?? "",
    completedAt: existing?.completedAt ?? null,
    completedOn: existing?.completedOn ?? null,
    inputs: Object.fromEntries(
      (existing?.sets ?? []).map((set) => {
        const values = workoutSetValuesSchema.parse(set.values);
        return [
          setInputKey(set.exerciseId, set.round),
          {
            weightKg: values.weightKg === null ? "" : String(values.weightKg),
            amount: String(values.amount),
            rightAmount:
              values.rightAmount === null ? "" : String(values.rightAmount),
          },
        ];
      }),
    ),
  };
}
export function collectWorkoutSets(
  exercises: readonly WorkoutExercise[],
  inputs: WorkoutSetInputs,
):
  | {
      success: true;
      sets: { exerciseId: string; round: number; values: WorkoutSetValues }[];
    }
  | { success: false; error: string } {
  const sets: {
    exerciseId: string;
    round: number;
    values: WorkoutSetValues;
  }[] = [];
  for (const exercise of exercises)
    for (let round = 1; round <= exercise.sets; round++) {
      const input = inputs[setInputKey(exercise.id, round)];
      if (!input || Object.values(input).every((value) => value.trim() === ""))
        continue;
      const parsed = workoutSetValuesSchema.safeParse({
        weightKg: input.weightKg.trim() === "" ? null : Number(input.weightKg),
        amount: input.amount.trim() === "" ? null : Number(input.amount),
        rightAmount:
          input.rightAmount.trim() === "" ? null : Number(input.rightAmount),
      });
      if (!parsed.success)
        return {
          success: false,
          error: `Enter valid weight and ${exercise.unit} for ${exercise.name}, set ${round}.`,
        };
      sets.push({ exerciseId: exercise.id, round, values: parsed.data });
    }
  return { success: true, sets };
}
