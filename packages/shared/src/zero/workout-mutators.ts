import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import { calendarDate } from "../habits";
import { starterWorkouts } from "../workout-seed";
import {
  createWorkoutSchema,
  importWorkoutsSchema,
  reorderWorkoutsSchema,
  saveWorkoutLogSchema,
  updateWorkoutLogNoteSchema,
  updateWorkoutSchema,
  workoutLogSnapshotSchema,
} from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { nextSortKey, planReorder } from "./ordering";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const scopedWorkouts = (householdId: string) =>
  zql.workouts.where("householdId", householdId);
const scopedWorkout = (householdId: string, id: string) =>
  scopedWorkouts(householdId).where("id", id).one();
const ownLog = (
  householdId: string,
  workoutId: string,
  userId: string,
  id: string,
) =>
  zql.workoutLogs
    .where("householdId", householdId)
    .where("workoutId", workoutId)
    .where("userId", userId)
    .where("id", id)
    .one();
async function access(
  tx: Transaction<Schema>,
  householdId: string,
  userId: string,
) {
  await requireServerHouseholdModuleAccess({
    tx,
    householdId,
    userId,
    moduleKey: "workouts",
  });
}
const timestamp = (tx: Transaction<Schema>, optimistic: number) =>
  tx.location === "server" ? Date.now() : optimistic;
export const workoutMutatorDefinitions = {
  reorder: define(reorderWorkoutsSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const rows = await tx.run(scopedWorkouts(args.householdId));
    const updates = planReorder(
      rows.map((row) => ({ id: row.id, sortKey: row.sortKey ?? 0 })),
      args.orderedWorkoutIds,
      args.workoutId,
    );
    for (const update of updates)
      await tx.mutate.workouts.update({
        ...update,
        updatedAt: timestamp(tx, args.optimisticTimestamp),
      });
  }),
  create: define(createWorkoutSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const now = timestamp(tx, args.optimisticTimestamp);
    const top = await tx.run(
      scopedWorkouts(args.householdId)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    await tx.mutate.workouts.insert({
      id: args.workoutId,
      householdId: args.householdId,
      title: args.title,
      sortKey: nextSortKey(top?.sortKey ?? 0),
      notes: "",
      exercises: [],
      createdAt: now,
      updatedAt: now,
    });
  }),
  update: define(updateWorkoutSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    if (!(await tx.run(scopedWorkout(args.householdId, args.workoutId))))
      throw new Error("Workout update not allowed");
    await tx.mutate.workouts.update({
      id: args.workoutId,
      ...args.changes,
      updatedAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),
  importStarters: define(importWorkoutsSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const now = timestamp(tx, args.optimisticTimestamp);
    const top = await tx.run(
      scopedWorkouts(args.householdId)
        .orderBy("sortKey", "desc")
        .orderBy("id", "asc")
        .one(),
    );
    let sortKey = top?.sortKey ?? 0;
    for (const [index, content] of [...starterWorkouts.entries()].reverse()) {
      sortKey = nextSortKey(sortKey);
      const id = args.workoutIds[index];
      if (!id) throw new Error("Missing workout ID");
      await tx.mutate.workouts.insert({
        id,
        householdId: args.householdId,
        ...content,
        sortKey,
        createdAt: now,
        updatedAt: now,
      });
    }
  }),
  updateLogNote: define(
    updateWorkoutLogNoteSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      const log = await tx.run(
        ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
      );
      if (!log) throw new Error("Workout log note update not allowed");
      await tx.mutate.workoutLogs.update({ id: log.id, note: args.note });
    },
  ),
  saveLog: define(saveWorkoutLogSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    if (!(await tx.run(scopedWorkout(args.householdId, args.workoutId))))
      throw new Error("Workout logging not allowed");
    const now = timestamp(tx, args.optimisticTimestamp);
    const completedOn = calendarDate(now, args.timeZone);
    const existing =
      (await tx.run(
        ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
      )) ??
      (await tx.run(
        zql.workoutLogs
          .where("householdId", args.householdId)
          .where("workoutId", args.workoutId)
          .where("userId", ctx.userId)
          .where("completedOn", completedOn)
          .one(),
      ));
    const logId = existing?.id ?? args.logId;
    // Existing logs retain the historical workout definition.
    const snapshot = workoutLogSnapshotSchema.parse(
      existing?.snapshot ?? args.snapshot,
    );
    for (const set of args.sets) {
      const exercise = snapshot.exercises.find((e) => e.id === set.exerciseId);
      if (
        !exercise ||
        set.round > exercise.sets ||
        (!exercise.unilateral && set.values.rightAmount !== null) ||
        (exercise.load === "bodyweight" && set.values.weightKg !== null)
      ) {
        throw new Error("Workout set update not allowed");
      }
    }
    if (existing) {
      if (args.note !== undefined)
        await tx.mutate.workoutLogs.update({
          id: existing.id,
          note: args.note,
        });
      const oldSets = await tx.run(
        zql.workoutLogSets.where("logId", existing.id),
      );
      for (const set of oldSets)
        await tx.mutate.workoutLogSets.delete({
          logId: set.logId,
          exerciseId: set.exerciseId,
          round: set.round,
        });
    } else {
      await tx.mutate.workoutLogs.insert({
        id: args.logId,
        householdId: args.householdId,
        workoutId: args.workoutId,
        userId: ctx.userId,
        note: args.note ?? "",
        snapshot,
        createdAt: now,
        completedAt: now,
        completedOn,
      });
    }
    for (const set of args.sets)
      await tx.mutate.workoutLogSets.insert({ logId, ...set });
  }),
};
