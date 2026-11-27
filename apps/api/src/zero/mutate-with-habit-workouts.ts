import { calendarScopeSchema } from "@home-hub/shared/calendar";
import {
  archiveHabitMutationSchema,
  linkHabitWorkoutsMutationSchema,
} from "@home-hub/shared/habits";
import { trainingScopeSchema } from "@home-hub/shared/training";
import { zql } from "@home-hub/shared/zero/schema";
import { mustGetMutator, type ReadonlyJSONValue } from "@rocicorp/zero";
import { sql } from "drizzle-orm";
import type { ZeroDbProvider } from "./db-provider";
import { refreshHabitCalendarCompletion } from "./habit-calendar-completion";
import {
  lockHabitWorkoutCompletion,
  refreshHabitWorkoutCompletion,
} from "./habit-workout-completion";
import { serverMutators } from "./server-mutators";

type ServerTransaction = Parameters<
  Parameters<ZeroDbProvider["transaction"]>[0]
>[0];

export async function mutateWithHabitWorkouts(
  tx: ServerTransaction,
  userId: string,
  name: string,
  args: ReadonlyJSONValue | undefined,
) {
  const mutator = mustGetMutator(serverMutators, name);

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
  const calendarChange = [
    "calendar.habit",
    "calendar.update",
    "calendar.delete",
    "households.leave",
    "households.removeMember",
    "households.delete",
  ].includes(name);
  const calendarHousehold =
    calendarChange && args && typeof args === "object" && "householdId" in args
      ? calendarScopeSchema.shape.householdId.parse(args.householdId)
      : undefined;
  const householdId =
    training?.householdId ?? habit?.householdId ?? calendarHousehold;
  const db = tx.dbTransaction.wrappedTransaction;

  if (householdId) {
    await lockHabitWorkoutCompletion(db, householdId);
  }

  if (
    (name.startsWith("calendar.") || calendarHousehold) &&
    args &&
    typeof args === "object" &&
    "householdId" in args
  ) {
    const calendarId = calendarScopeSchema.shape.householdId.parse(
      args.householdId,
    );
    // Serialize append/move/rebalance operations, including stale-client reorders.
    const key = `calendar:${calendarId}`;
    await db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
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

  if (calendarHousehold && name !== "households.delete") {
    await refreshHabitCalendarCompletion(db, calendarHousehold);
  }

  return result;
}
