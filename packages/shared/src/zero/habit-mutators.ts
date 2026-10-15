import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  archiveHabitMutationSchema,
  calendarDate,
  createHabitMutationSchema,
  renameHabitMutationSchema,
  setHabitCompletedMutationSchema,
} from "../habits";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const defineMutator = defineMutatorWithType<Schema, ZeroAuthContext>();
type Tx = Transaction<Schema>;
const timestamp = (tx: Tx, optimistic: number) =>
  tx.location === "server" ? Date.now() : optimistic;

async function requireAccess(
  tx: Tx,
  ctx: ZeroAuthContext,
  householdId: string,
) {
  await requireServerHouseholdModuleAccess({
    tx,
    userId: ctx.userId,
    householdId,
    moduleKey: "habits",
  });
}
async function requireHabit(
  tx: Tx,
  ctx: ZeroAuthContext,
  args: { householdId: string; habitId: string },
) {
  await requireAccess(tx, ctx, args.householdId);
  const habit = await tx.run(
    zql.habits
      .where("householdId", args.householdId)
      .where("id", args.habitId)
      .one(),
  );
  if (!habit) throw new Error("Habit mutation not allowed");
  return habit;
}

export const habitMutatorDefinitions = {
  create: defineMutator(
    createHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireAccess(tx, ctx, args.householdId);
      const now = timestamp(tx, args.optimisticTimestamp);
      await tx.mutate.habits.insert({
        id: args.habitId,
        householdId: args.householdId,
        name: args.name,
        createdOn: calendarDate(now, args.timeZone),
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    },
  ),
  rename: defineMutator(
    renameHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.archivedAt != null)
        throw new Error("Habit mutation not allowed");
      await tx.mutate.habits.update({
        id: habit.id,
        name: args.name,
        updatedAt: timestamp(tx, args.optimisticTimestamp),
      });
    },
  ),
  archive: defineMutator(
    archiveHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.archivedAt != null) return;
      const now = timestamp(tx, args.optimisticTimestamp);
      await tx.mutate.habits.update({
        id: habit.id,
        archivedAt: now,
        updatedAt: now,
      });
    },
  ),
  setCompleted: defineMutator(
    setHabitCompletedMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      const now = timestamp(tx, args.optimisticTimestamp);
      if (
        habit.archivedAt != null ||
        args.completedOn < habit.createdOn ||
        args.completedOn > calendarDate(now, args.timeZone)
      ) {
        throw new Error("Habit completion not allowed");
      }
      // The actor is always trusted context, never a user ID supplied by the client.
      const key = {
        habitId: habit.id,
        userId: ctx.userId,
        completedOn: args.completedOn,
      };
      if (!args.completed) {
        await tx.mutate.habitCompletions.delete(key);
        return;
      }
      // Zero insert ignores an existing primary key, preserving its original timestamp.
      await tx.mutate.habitCompletions.insert({
        ...key,
        householdId: args.householdId,
        createdAt: now,
        updatedAt: now,
      });
    },
  ),
};
