import {
  type WorkoutExercise,
  type WorkoutSetValues,
  workoutLogSnapshotSchema,
  workoutSetValuesFromRow,
} from "@home-hub/shared/workouts";
import type { WorkoutLog } from "./workout-log";

function describeSet(exercise: WorkoutExercise, values: WorkoutSetValues) {
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
      if (!sets.length) return [];
      const descriptions = sets.map((s) =>
        describeSet(exercise, workoutSetValuesFromRow(s)),
      );
      const same = descriptions.every((value) => value === descriptions[0]);
      const details = same
        ? `${sets.length > 1 ? `${sets.length} × ` : ""}${descriptions[0]}`
        : descriptions
            .map((value, index) => `Set ${sets[index]?.round}: ${value}`)
            .join("; ");
      return [{ id: exercise.id, name: exercise.name, details }];
    });
}
