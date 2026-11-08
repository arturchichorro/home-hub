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

export async function mutateWithHabitWorkouts(
  tx: ServerTransaction,
  userId: string,
  name: string,
  args: ReadonlyJSONValue | undefined,
) {
  const mutator = mustGetMutator(mutators, name);
  const training =
    name.startsWith("training.") &&
    args &&
    typeof args === "object" &&
    "householdId" in args &&
    "logId" in args
      ? trainingScopeSchema.parse({
          householdId: args.householdId,
          logId: args.logId,
        })
      : undefined;
  const habit =
    name === "habits.linkWorkouts"
      ? linkHabitWorkoutsMutationSchema.parse(args)
      : name === "habits.archive"
        ? archiveHabitMutationSchema.parse(args)
        : undefined;
  const householdId = training?.householdId ?? habit?.householdId;
  const db = tx.dbTransaction.wrappedTransaction;

  if (householdId) {
    await lockHabitWorkoutCompletion(db, householdId);
  }

  if (training) {
    const key = [userId, training.householdId, "training"].join(":");
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  const result = await mutator.fn({ tx, args, ctx: { userId } });

  if (training) {
    const row = await tx.run(
      zql.trainingSessions
        .where("id", training.logId)
        .where("householdId", training.householdId)
        .where("userId", userId)
        .one(),
    );

    await refreshHabitWorkoutCompletion(db, {
      householdId: training.householdId,
      userId,
      ...(row ? { entryOn: row.completedOn } : {}),
    });
  } else if (name === "habits.linkWorkouts" && habit) {
    await refreshHabitWorkoutCompletion(db, {
      householdId: habit.householdId,
      habitId: habit.habitId,
    });
  }

  return result;
}
