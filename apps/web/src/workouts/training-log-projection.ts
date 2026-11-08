import { workoutExerciseSchema } from "@home-hub/shared/workouts";
import type {
  TrainingSession,
  TrainingSessionExercise,
} from "@home-hub/shared/zero/schema";
import type { WorkoutLog } from "./workout-log";
import type { ExercisePerformance } from "./workout-log-projection";

export type TrainingSessionRow = TrainingSession & {
  readonly loggedExercises: readonly (TrainingSessionExercise & {
    readonly occurrence: ExercisePerformance | undefined;
  })[];
};
export function projectTrainingSession(row: TrainingSessionRow): WorkoutLog {
  const links = [...row.loggedExercises].sort(
    (a, b) =>
      a.position - b.position || a.exerciseId.localeCompare(b.exerciseId),
  );
  return {
    id: row.id,
    householdId: row.householdId,
    userId: row.userId,
    workoutId: null,
    note: row.note,
    completedOn: row.completedOn,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    exerciseRoles: {},
    snapshot: {
      title: "Free training",
      exercises: links.flatMap((link) =>
        link.occurrence
          ? [
              {
                ...workoutExerciseSchema.parse(link.occurrence.snapshot),
                id: link.exerciseId,
                catalogExerciseId: link.occurrence.exerciseId,
                role: "workout" as const,
              },
            ]
          : [],
      ),
    },
    logOnlyExerciseIds: links.map((link) => link.exerciseId),
    exerciseLogIds: Object.fromEntries(
      links.map((link) => [link.exerciseId, link.exerciseLogId]),
    ),
    sets: links.flatMap(
      (link) =>
        link.occurrence?.sets.map((set) => ({
          ...set,
          logId: row.id,
          householdId: row.householdId,
          workoutExerciseId: link.exerciseId,
          exerciseId: link.exerciseId,
        })) ?? [],
    ),
  };
}
