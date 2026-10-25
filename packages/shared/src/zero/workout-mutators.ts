import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import { calendarDate } from "../habits";
import { starterWorkouts } from "../workout-seed";
import {
  createWorkoutSchema,
  importWorkoutsSchema,
  saveWorkoutSetSchema,
  updateWorkoutSchema,
  workoutContentSchema,
  workoutLogActionSchema,
} from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const scopedWorkout = (householdId: string, id: string) =>
  zql.workouts.where("householdId", householdId).where("id", id).one();
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
  create: define(createWorkoutSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.workouts.insert({
      id: args.workoutId,
      householdId: args.householdId,
      title: args.title,
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
    for (const [index, content] of starterWorkouts.entries()) {
      const id = args.workoutIds[index];
      if (!id) throw new Error("Missing workout ID");
      await tx.mutate.workouts.insert({
        id,
        householdId: args.householdId,
        ...content,
        createdAt: now,
        updatedAt: now,
      });
    }
  }),
  log: define(workoutLogActionSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const workout = await tx.run(
      scopedWorkout(args.householdId, args.workoutId),
    );
    if (!workout) throw new Error("Workout logging not allowed");
    const existing = await tx.run(
      ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
    );
    const now = timestamp(tx, args.optimisticTimestamp);
    if (existing) {
      if (args.action === "complete" && existing.status === "active")
        await tx.mutate.workoutLogs.update({
          id: existing.id,
          status: "completed",
          completedAt: now,
          completedOn: calendarDate(now, args.timeZone),
        });
      return;
    }
    await tx.mutate.workoutLogs.insert({
      id: args.logId,
      householdId: args.householdId,
      workoutId: workout.id,
      userId: ctx.userId,
      snapshot: workoutContentSchema.parse({
        title: workout.title,
        notes: workout.notes,
        exercises: workout.exercises,
      }),
      status: args.action === "complete" ? "completed" : "active",
      createdAt: now,
      completedAt: args.action === "complete" ? now : null,
      completedOn:
        args.action === "complete" ? calendarDate(now, args.timeZone) : null,
    });
  }),
  saveSet: define(saveWorkoutSetSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const log = await tx.run(
      ownLog(args.householdId, args.workoutId, ctx.userId, args.logId),
    );
    if (!log || log.status === "abandoned")
      throw new Error("Workout set update not allowed");
    const exercise = workoutContentSchema
      .parse(log.snapshot)
      .exercises.find((e) => e.id === args.exerciseId);
    if (
      !exercise ||
      args.round > exercise.sets ||
      (!exercise.unilateral && args.values.rightAmount !== null) ||
      (exercise.load === "bodyweight" && args.values.weightKg !== null)
    )
      throw new Error("Workout set update not allowed");
    await tx.mutate.workoutLogSets.upsert({
      logId: log.id,
      exerciseId: exercise.id,
      round: args.round,
      values: args.values,
    });
  }),
};
