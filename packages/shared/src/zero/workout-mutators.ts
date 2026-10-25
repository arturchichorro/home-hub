import { defineMutatorWithType, type Transaction } from "@rocicorp/zero";
import { calendarDate } from "../habits";
import {
  nextWorkout,
  saveWorkoutPlanSchema,
  saveWorkoutSetSchema,
  startWorkoutCycleSchema,
  startWorkoutSessionSchema,
  workoutPlanSchema,
  workoutSessionActionSchema,
  workoutSnapshotSchema,
} from "../workouts";
import type { ZeroAuthContext } from "./context";
import { requireServerHouseholdModuleAccess } from "./mutation-authorization";
import { type Schema, zql } from "./schema.gen";

const define = defineMutatorWithType<Schema, ZeroAuthContext>();
const ownSessions = (householdId: string, userId: string) =>
  zql.workoutSessions.where("householdId", householdId).where("userId", userId);
const ownCycles = (householdId: string, userId: string) =>
  zql.workoutCycles.where("householdId", householdId).where("userId", userId);
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
function timestamp(tx: Transaction<Schema>, optimistic: number) {
  return tx.location === "server" ? Date.now() : optimistic;
}

export const workoutMutatorDefinitions = {
  savePlan: define(saveWorkoutPlanSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const existing = await tx.run(
      zql.workoutPlans
        .where("householdId", args.householdId)
        .where("id", args.planId)
        .one(),
    );
    const now = timestamp(tx, args.optimisticTimestamp);
    if (args.create) {
      if (existing) throw new Error("Plan already exists");
      await tx.mutate.workoutPlans.insert({
        id: args.planId,
        householdId: args.householdId,
        title: args.title,
        definition: args.definition,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      if (!existing) throw new Error("Workout plan update not allowed");
      await tx.mutate.workoutPlans.update({
        id: existing.id,
        title: args.title,
        definition: args.definition,
        updatedAt: now,
      });
    }
  }),
  startCycle: define(startWorkoutCycleSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const plan = await tx.run(
      zql.workoutPlans
        .where("householdId", args.householdId)
        .where("id", args.planId)
        .one(),
    );
    if (
      !plan ||
      (await tx.run(
        ownSessions(args.householdId, ctx.userId)
          .where("status", "active")
          .one(),
      ))
    )
      throw new Error("Workout cycle start not allowed");
    const now = timestamp(tx, args.optimisticTimestamp);
    await tx.mutate.workoutCycles.insert({
      id: args.cycleId,
      householdId: args.householdId,
      userId: ctx.userId,
      planId: plan.id,
      startedOn: calendarDate(now, args.timeZone),
      createdAt: now,
    });
  }),
  startSession: define(startWorkoutSessionSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const cycle = await tx.run(
      ownCycles(args.householdId, ctx.userId)
        .orderBy("createdAt", "desc")
        .orderBy("id", "desc")
        .one(),
    );
    if (
      !cycle ||
      cycle.id !== args.cycleId ||
      (await tx.run(
        ownSessions(args.householdId, ctx.userId)
          .where("status", "active")
          .one(),
      ))
    )
      throw new Error("Workout start not allowed");
    const planRow = await tx.run(
      zql.workoutPlans
        .where("householdId", args.householdId)
        .where("id", cycle.planId)
        .one(),
    );
    if (!planRow) throw new Error("Workout plan not allowed");
    const plan = workoutPlanSchema.parse(planRow.definition);
    const last = await tx.run(
      ownSessions(args.householdId, ctx.userId)
        .where("cycleId", cycle.id)
        .where("status", "completed")
        .orderBy("completedAt", "desc")
        .orderBy("id", "desc")
        .one(),
    );
    const workout = nextWorkout(plan, last?.workoutId);
    await tx.mutate.workoutSessions.insert({
      id: args.sessionId,
      householdId: args.householdId,
      userId: ctx.userId,
      cycleId: cycle.id,
      workoutId: workout.id,
      snapshot: {
        workout,
        warmup: plan.warmup,
        finish: plan.finish,
        guidance: plan.guidance,
        incrementKg: plan.incrementKg,
      },
      lowEnergy: args.lowEnergy,
      status: "active",
      note: "",
      completedOn: null,
      completedAt: null,
      createdAt: timestamp(tx, args.optimisticTimestamp),
    });
  }),
  saveSet: define(saveWorkoutSetSchema, async ({ tx, ctx, args }) => {
    await access(tx, args.householdId, ctx.userId);
    const session = await tx.run(
      ownSessions(args.householdId, ctx.userId)
        .where("id", args.sessionId)
        .one(),
    );
    if (!session || session.status === "abandoned")
      throw new Error("Workout set update not allowed");
    const { workout } = workoutSnapshotSchema.parse(session.snapshot);
    const exercise = workout.exercises.find((e) => e.id === args.exerciseId);
    if (
      !exercise ||
      args.round > (session.lowEnergy ? 1 : exercise.sets) ||
      (!exercise.unilateral && args.values.rightAmount !== null) ||
      (exercise.load === "bodyweight" && args.values.weightKg !== null)
    )
      throw new Error("Workout set update not allowed");
    await tx.mutate.workoutSets.upsert({
      sessionId: session.id,
      exerciseId: exercise.id,
      round: args.round,
      values: args.values,
    });
  }),
  sessionAction: define(
    workoutSessionActionSchema,
    async ({ tx, ctx, args }) => {
      await access(tx, args.householdId, ctx.userId);
      const session = await tx.run(
        ownSessions(args.householdId, ctx.userId)
          .where("id", args.sessionId)
          .related("sets")
          .one(),
      );
      if (!session) throw new Error("Workout session update not allowed");
      if (args.action === "note") {
        await tx.mutate.workoutSessions.update({
          id: session.id,
          note: args.note,
        });
        return;
      }
      if (session.status !== "active")
        throw new Error("Workout session change not allowed");
      if (args.action === "complete") {
        const { workout } = workoutSnapshotSchema.parse(session.snapshot);
        if (
          !workout.exercises.every((e) =>
            Array.from({ length: session.lowEnergy ? 1 : e.sets }, (_, i) =>
              session.sets.some(
                (s) => s.exerciseId === e.id && s.round === i + 1,
              ),
            ).every(Boolean),
          )
        )
          throw new Error("Log each prescribed set before completing");
        const now = timestamp(tx, args.optimisticTimestamp);
        await tx.mutate.workoutSessions.update({
          id: session.id,
          status: "completed",
          note: args.note,
          completedAt: now,
          completedOn: calendarDate(now, args.timeZone),
        });
      } else {
        await tx.mutate.workoutSessions.update({
          id: session.id,
          status: "abandoned",
          note: args.note,
        });
      }
    },
  ),
};
