import type {
  ExerciseLog,
  ExerciseLogSet,
  WorkoutLog as Log,
  WorkoutLogExercise,
} from "@home-hub/shared/zero/schema";
import type { WorkoutLog } from "./workout-log";

export type ExercisePerformance = ExerciseLog & {
  readonly sets: readonly ExerciseLogSet[];
};
export type WorkoutLogWithExercises = Log & {
  readonly loggedExercises: readonly (WorkoutLogExercise & {
    readonly occurrence: ExercisePerformance | undefined;
  })[];
};
// Presentation projection only: storage and writes belong to exercise occurrences.
export function projectWorkoutLog(log: WorkoutLogWithExercises): WorkoutLog {
  return {
    ...log,
    exerciseLogIds: Object.fromEntries(
      log.loggedExercises.map((link) => [
        link.workoutExerciseId,
        link.exerciseLogId,
      ]),
    ),
    sets: log.loggedExercises.flatMap(
      (link) =>
        link.occurrence?.sets.map((set) => ({
          ...set,
          logId: log.id,
          householdId: log.householdId,
          workoutExerciseId: link.workoutExerciseId,
          exerciseId: link.occurrence?.exerciseId ?? "",
        })) ?? [],
    ),
  };
}
