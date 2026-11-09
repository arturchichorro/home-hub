import {
  type WorkoutSetValues,
  workoutLogSnapshotSchema,
  workoutSetValuesFromRow,
} from "@home-hub/shared/workouts";
import type { ExercisePerformance } from "./training-log-projection";
import type { WorkoutLog } from "./workout-log";

export function summarizeExercisePerformance(
  performance: Pick<ExercisePerformance, "sets">,
) {
  const sets = [...performance.sets].sort((a, b) => a.round - b.round);
  const descriptions = sets.map((set) =>
    describeSet(set, workoutSetValuesFromRow(set)),
  );

  if (!descriptions.length) {
    return "";
  }

  return descriptions.every((value) => value === descriptions[0])
    ? `${sets.length > 1 ? `${sets.length} × ` : ""}${descriptions[0]}`
    : descriptions
        .map((value, index) => `Set ${sets[index]?.round}: ${value}`)
        .join("; ");
}

function describeSet(
  exercise: { unit: string; load: string; unilateral: boolean },
  values: WorkoutSetValues,
) {
  const amount = exercise.unilateral
    ? `Left ${values.amount} / Right ${values.rightAmount ?? values.amount} ${exercise.unit}`
    : `${values.amount} ${exercise.unit}`;
  const weight =
    values.weightKg !== null
      ? ` · ${values.weightKg} kg${exercise.load === "per-hand" ? "/hand" : ""}`
      : exercise.load === "bodyweight"
        ? " · bodyweight"
        : "";

  return amount + weight;
}

export function summarizeWorkoutLog(
  log: Pick<WorkoutLog, "snapshot" | "sets">,
) {
  return workoutLogSnapshotSchema
    .parse(log.snapshot)
    .exercises.flatMap((exercise) => {
      const sets = log.sets
        .filter((s) => s.workoutExerciseId === exercise.id)
        .sort((a, b) => a.round - b.round);

      if (!sets.length) {
        return [];
      }

      const descriptions = sets.map((s) =>
        describeSet(s, workoutSetValuesFromRow(s)),
      );
      const same = descriptions.every((value) => value === descriptions[0]);
      const details = same
        ? `${sets.length > 1 ? `${sets.length} × ` : ""}${descriptions[0]}`
        : descriptions
            .map((value, index) => `Set ${sets[index]?.round}: ${value}`)
            .join("; ");

      return [
        {
          id: exercise.id,
          name: exercise.name,
          ...(exercise.catalogExerciseId
            ? { catalogExerciseId: exercise.catalogExerciseId }
            : {}),
          details,
          ...(exercise.role && exercise.role !== "workout"
            ? { role: exercise.role }
            : {}),
        },
      ];
    });
}
