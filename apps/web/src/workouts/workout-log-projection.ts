import {
  workoutExerciseRolesSnapshotSchema,
  workoutExerciseSchema,
  workoutLogSnapshotSchema,
} from "@home-hub/shared/workouts";
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

export type WorkoutLogWithExercises = Omit<Log, "exerciseRoles"> & {
  readonly exerciseRoles?: Log["exerciseRoles"] | undefined;
  readonly loggedExercises: readonly (WorkoutLogExercise & {
    readonly occurrence: ExercisePerformance | undefined;
  })[];
};

// Presentation projection only: storage and writes belong to exercise occurrences.
export function projectWorkoutLog(log: WorkoutLogWithExercises): WorkoutLog {
  const roles = workoutExerciseRolesSnapshotSchema.parse(
    log.exerciseRoles ?? {},
  );
  const snapshot = workoutLogSnapshotSchema.parse(log.snapshot);
  const baseIds = new Set(snapshot.exercises.map((exercise) => exercise.id));
  const extra = [...log.loggedExercises]
    .sort(
      (a, b) =>
        a.position - b.position ||
        a.workoutExerciseId.localeCompare(b.workoutExerciseId),
    )
    .filter((link) => !baseIds.has(link.workoutExerciseId) && link.occurrence)
    .map((link) => ({
      ...workoutExerciseSchema.parse(link.occurrence?.snapshot),
      id: link.workoutExerciseId,
      catalogExerciseId: link.occurrence?.exerciseId,
      role: "workout" as const,
    }));

  return {
    ...log,
    snapshot: {
      ...snapshot,

      exercises: [
        ...snapshot.exercises.map((exercise) => ({
          ...exercise,
          role: roles[exercise.id] ?? "workout",
        })),
        ...extra,
      ],
    },
    logOnlyExerciseIds: extra.map((exercise) => exercise.id),
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
