import {
  removeExerciseSetSchema,
  saveExerciseSetSchema,
} from "@home-hub/shared/exercise-logs";
import {
  archiveHabitMutationSchema,
  linkHabitWorkoutsMutationSchema,
} from "@home-hub/shared/habits";
import { trainingScopeSchema } from "@home-hub/shared/training";
import { mutators } from "@home-hub/shared/zero/mutators";
import { zql } from "@home-hub/shared/zero/schema";
import { mustGetMutator, type ReadonlyJSONValue } from "@rocicorp/zero";
import { sql } from "drizzle-orm";
import type { ZeroDbProvider } from "./db-provider";
import {
  lockHabitWorkoutCompletion,
  refreshHabitWorkoutCompletion,
} from "./habit-workout-completion";

type ServerTransaction = Parameters<
  Parameters<ZeroDbProvider["transaction"]>[0]
>[0];

// Called inside the same transaction as mutation acknowledgement, never as a job.
export async function mutateWithHabitWorkouts(
  tx: ServerTransaction,
  userId: string,
  name: string,
  args: ReadonlyJSONValue | undefined,
) {
  if (name === "workouts.saveLog") {
    throw new Error(
      "Workout logging has changed. Reload Home Hub before logging.",
    );
  }

  const mutator = mustGetMutator(mutators, name);
  const workoutScope =
    name === "workouts.saveSet"
      ? saveExerciseSetSchema.parse(args)
      : name === "workouts.removeSet"
        ? removeExerciseSetSchema.parse(args)
        : undefined;
  const trainingScope =
    name.startsWith("training.") && args
      ? trainingScopeSchema.parse({
          householdId: (args as { householdId?: string }).householdId,
          logId: (args as { logId?: string }).logId,
        })
      : undefined;
  const habitScope =
    name === "habits.linkWorkouts"
      ? linkHabitWorkoutsMutationSchema.parse(args)
      : name === "habits.archive"
        ? archiveHabitMutationSchema.parse(args)
        : undefined;
  const completionHousehold =
    workoutScope?.householdId ??
    trainingScope?.householdId ??
    habitScope?.householdId;
  const db = tx.dbTransaction.wrappedTransaction;

  if (completionHousehold) {
    await lockHabitWorkoutCompletion(db, completionHousehold);
  }

  if (workoutScope) {
    const scope = workoutScope;
    // Serialize daily-header creation and row writes for this author only,
    // without announcing private logging through shared updated_at fields.
    const key = [userId, scope.householdId, scope.workoutId].join(":");
    await tx.dbTransaction.wrappedTransaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  if (trainingScope) {
    const key = [userId, trainingScope.householdId, "free-training"].join(":");
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  const result = await mutator.fn({
    tx,
    args,
    ctx: { userId },
  });

  if (workoutScope) {
    const logs = zql.workoutLogs
      .where("householdId", workoutScope.householdId)
      .where("userId", userId)
      .where("workoutId", workoutScope.workoutId);
    const log =
      (await tx.run(logs.where("id", workoutScope.logId).one())) ??
      (workoutScope.completedOn
        ? await tx.run(
            logs.where("completedOn", workoutScope.completedOn).one(),
          )
        : undefined);

    if (log) {
      await refreshHabitWorkoutCompletion(db, {
        householdId: workoutScope.householdId,
        userId,
        entryOn: log.completedOn,
      });
    }
  } else if (trainingScope) {
    const row = await tx.run(
      zql.trainingSessions
        .where("id", trainingScope.logId)
        .where("householdId", trainingScope.householdId)
        .where("userId", userId)
        .one(),
    );
    // A canonical daily header can differ from a stale client\'s proposed ID.
    // Refreshing this author across days also safely covers that convergence.
    await refreshHabitWorkoutCompletion(db, {
      householdId: trainingScope.householdId,
      userId,
      ...(row ? { entryOn: row.completedOn } : {}),
    });
  } else if (name === "habits.linkWorkouts" && habitScope) {
    await refreshHabitWorkoutCompletion(db, {
      householdId: habitScope.householdId,
      habitId: habitScope.habitId,
    });
  }

  return result;
}
