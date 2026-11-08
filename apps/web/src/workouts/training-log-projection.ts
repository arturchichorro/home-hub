import { workoutExerciseSchema } from "@home-hub/shared/workouts";
import type {
  TrainingSession,
  TrainingSessionExercise,
  TrainingSessionSet,
} from "@home-hub/shared/zero/schema";
import type { WorkoutLog } from "./workout-log";

export type ExercisePerformance = TrainingSessionExercise & {
  readonly sets: readonly TrainingSessionSet[];
};
export type TrainingSessionRow = TrainingSession & {
  readonly exercises: readonly ExercisePerformance[];
};

// A form/view projection, not a second persisted snapshot or logging model.
export function projectTrainingSession(row: TrainingSessionRow): WorkoutLog {
  const exercises = row.exercises
    .filter((value) => value.deletedAt === null)
    .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const key = (value: TrainingSessionExercise) =>
    value.templateExerciseId ?? value.exerciseId;

  return {
    id: row.id,
    householdId: row.householdId,
    userId: row.userId,
    workoutId: row.workoutId,
    note: row.note,
    completedOn: row.completedOn,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    snapshot: {
      title: row.name || "Free training",
      exercises: exercises.map((value) =>
        workoutExerciseSchema.parse({
          id: key(value),
          catalogExerciseId: value.exerciseId,
          name: value.name,
          role: value.role,
          unit: value.unit,
          load: value.load,
          unilateral: value.unilateral,
          sets: value.plannedSets ?? 2,
          target: value.target ?? "",
        }),
      ),
    },
    logOnlyExerciseIds: exercises
      .filter((value) => value.templateExerciseId === null)
      .map(key),
    sessionExerciseIds: Object.fromEntries(
      exercises.map((value) => [key(value), value.id]),
    ),
    sets: exercises.flatMap((value) =>
      value.sets.map((set) => ({
        ...set,
        logId: row.id,
        householdId: row.householdId,
        workoutExerciseId: key(value),
        exerciseId: value.exerciseId,
      })),
    ),
  };
}
