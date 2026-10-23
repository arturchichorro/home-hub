import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import {
  archiveHabitMutationSchema,
  calendarDate,
  createHabitMutationSchema,
  renameHabitMutationSchema,
  reorderHabitsMutationSchema,
  setHabitCompletedMutationSchema,
  updateHabitEntryNoteMutationSchema,
  updateHabitNoteMutationSchema,
} from "../habits";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { nextSortKey, planReorder } from "./ordering";
import { type Schema, zql } from "./schema.gen";

const activeHabits = (householdId: string) =>
  zql.habits.where("householdId", householdId).where("status", "active");

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

async function requireEntryAccess(
  tx: Tx,
  ctx: ZeroAuthContext,
  args: {
    householdId: string;
    habitId: string;
    entryOn: string;
    timeZone: string;
    optimisticTimestamp: number;
  },
) {
  const habit = await requireHabit(tx, ctx, args);
  const now = timestamp(tx, args.optimisticTimestamp);
  if (
    habit.status !== "active" ||
    args.entryOn > calendarDate(now, args.timeZone)
  )
    throw new Error("Daily habit mutation not allowed");
  return {
    now,
    key: {
      householdId: args.householdId,
      habitId: habit.id,
      userId: ctx.userId,
      entryOn: args.entryOn,
    },
  };
}

export const habitMutatorDefinitions = {
  create: defineMutator(
    createHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      await requireAccess(tx, ctx, args.householdId);
      const now = timestamp(tx, args.optimisticTimestamp);
      const top = await tx.run(
        activeHabits(args.householdId)
          .orderBy("sortKey", "desc")
          .orderBy("id", "asc")
          .one(),
      );
      await tx.mutate.habits.insert({
        id: args.habitId,
        householdId: args.householdId,
        name: args.name,
        note: null,
        sortKey: nextSortKey(top?.sortKey ?? 0),
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    },
  ),
  reorder: defineMutator(
    reorderHabitsMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.status !== "active")
        throw new Error("Habit reorder not allowed");
      const rows = await tx.run(activeHabits(args.householdId));
      const updates = planReorder(
        rows.map((row) => ({ id: row.id, sortKey: row.sortKey ?? 0 })),
        args.orderedHabitIds,
        args.habitId,
      );
      const updatedAt = timestamp(tx, args.optimisticTimestamp);
      for (const update of updates)
        await tx.mutate.habits.update({ ...update, updatedAt });
    },
  ),
  rename: defineMutator(
    renameHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.status !== "active")
        throw new Error("Habit mutation not allowed");
      await tx.mutate.habits.update({
        id: habit.id,
        name: args.name,
        updatedAt: timestamp(tx, args.optimisticTimestamp),
      });
    },
  ),
  updateNote: defineMutator(
    updateHabitNoteMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.status !== "active")
        throw new Error("Habit note mutation not allowed");
      await tx.mutate.habits.update({
        id: habit.id,
        note: args.note,
        updatedAt: timestamp(tx, args.optimisticTimestamp),
      });
    },
  ),
  archive: defineMutator(
    archiveHabitMutationSchema,
    async ({ tx, ctx, args }) => {
      const habit = await requireHabit(tx, ctx, args);
      if (habit.status === "archived") return;
      const now = timestamp(tx, args.optimisticTimestamp);
      await tx.mutate.habits.update({
        id: habit.id,
        status: "archived",
        updatedAt: now,
      });
    },
  ),
  setCompleted: defineMutator(
    setHabitCompletedMutationSchema,
    async ({ tx, ctx, args }) => {
      const { now, key } = await requireEntryAccess(tx, ctx, args);
      // Partial upserts preserve the independently edited note, including when
      // another device creates the day's row concurrently. createdAt uses its DB default.
      await tx.mutate.habitEntries.upsert({
        ...key,
        completed: args.completed,
        updatedAt: now,
      });
    },
  ),
  updateEntryNote: defineMutator(
    updateHabitEntryNoteMutationSchema,
    async ({ tx, ctx, args }) => {
      const { now, key } = await requireEntryAccess(tx, ctx, args);
      await tx.mutate.habitEntries.upsert({
        ...key,
        note: args.note,
        updatedAt: now,
      });
    },
  ),
};
